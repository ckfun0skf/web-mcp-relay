import { inspectTab, executeNative } from './native.js';
import { policy } from './agent-policy.js';
const hex = b => Array.from(b, n => n.toString(16).padStart(2, '0')).join('');
let session = null, socket = null, binding = null, paused = false, connecting = false, busy = false, pending = null, sequence = 0, heartbeat, expiryTimer, handshake;
let status = 'Not connected', activity = [];
const ready = (async () => {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }); await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const local = await chrome.storage.local.get(['relay', 'relayCredentials']); if (local.relay && local.relayCredentials?.[local.relay]) await chrome.storage.local.set({ setupComplete: true });
  const saved = (await chrome.storage.session.get('relaySession')).relaySession; if (saved?.deadline > Date.now()) { session = saved; status = 'Disconnected. Resume to reconnect.'; } else await chrome.storage.session.remove('relaySession');
})();
function note(text) { activity.unshift(new Date().toISOString() + ' ' + text); activity = activity.slice(0, 40); }
function rejectPending() { if (pending) { clearTimeout(pending.timer); pending.resolve({ allowed: false }); pending = null; } chrome.action.setBadgeText({ text: '' }).catch(() => {}); }
function detach(text) { sequence++; clearInterval(heartbeat); clearTimeout(expiryTimer); clearTimeout(handshake); const old = socket; socket = null; old?.close(); binding = null; paused = false; connecting = false; policy.clear(); rejectPending(); status = text; }
async function end(text = 'Session ended.') { detach(text); session = null; await chrome.storage.session.remove('relaySession'); }
function base(value) { const u = new URL(value); if (u.protocol !== 'https:' || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw new Error('Use an HTTPS base URL without /mcp.'); return u.origin; }
async function view() {
  if (session && session.deadline <= Date.now()) await end('Session expired.');
  const local = await chrome.storage.local.get(['relay', 'relayCredentials', 'setupComplete']); const draft = (await chrome.storage.session.get('setupDraft')).setupDraft || {}; const p = policy.summary();
  return { setupComplete: Boolean(local.setupComplete), relay: local.relay || '', hasSecret: Boolean(local.relayCredentials?.[local.relay]), draft, session, connected: Boolean(socket?.readyState === WebSocket.OPEN && binding && !connecting && session?.deadline > Date.now()), transportConnected: socket?.readyState === WebSocket.OPEN, connecting, trusted: p.trusted, permissionMode: p.mode, needsTrustChoice: p.needsChoice, paused, status, documentId: binding?.documentId, pending: pending ? { id: pending.id, origin: pending.origin, tool: pending.tool, arguments: pending.arguments } : null, activity };
}
async function connect(m) {
  if (connecting) throw new Error('Connection already in progress.');
  const relay = base(m.relay); const local = await chrome.storage.local.get('relayCredentials'); const secret = m.owner || local.relayCredentials?.[relay];
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret || '')) throw new Error('Enter a valid OWNER_SECRET for this relay.');
  const oldSession = session; detach('Checking relay…'); connecting = true; const generation = sequence;
  try {
    const response = await fetch(relay + '/health', { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(8000) }); if (!response.ok) throw new Error('Relay HTTP ' + response.status);
    const health = await response.json(); if (health.name !== 'web-mcp-relay' || health.protocolVersion !== 1) throw new Error('Incompatible relay.');
    const selected = await inspectTab(m.tabId, m.documentId); if (!selected.available || !selected.executable) throw new Error('No executable WebMCP tools.'); if (generation !== sequence) return;
    const reuse = oldSession && oldSession.relay === relay && oldSession.tabId === m.tabId && oldSession.origin === selected.origin && oldSession.deadline > Date.now();
    session = reuse ? oldSession : { key: hex(crypto.getRandomValues(new Uint8Array(32))), relay, tabId: m.tabId, origin: selected.origin, deadline: Date.now() + 3600000, id: crypto.randomUUID() }; binding = selected; paused = false;
    await policy.bind({ sessionId: session.id, documentId: selected.documentId, origin: session.origin }); if (generation !== sequence) return;
    await chrome.storage.session.set({ relaySession: session }); await chrome.storage.local.set({ relay, relayCredentials: { ...(local.relayCredentials || {}), [relay]: secret } });
    const route = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(session.key)))); if (generation !== sequence) return;
    const ws = new WebSocket(relay.replace('https:', 'wss:') + '/browser?session=' + route, ['web-mcp-relay-v1', secret]); socket = ws; status = 'Connecting…';
    handshake = setTimeout(() => { if (socket === ws) detach('Handshake timed out. Resume to retry.'); }, 12000);
    ws.onerror = () => { if (socket === ws) status = 'WebSocket error. Check relay credentials.'; }; ws.onclose = () => { if (socket === ws) detach('Connection lost. Resume the unexpired session.'); };
    ws.onmessage = async event => {
      if (socket !== ws) return; let request; try { if (typeof event.data !== 'string' || event.data.length > 128000) throw new Error(); request = JSON.parse(event.data); } catch { await end('Invalid relay frame.'); return; }
      if (request.type === 'ready') {
        if (!session || !Number.isFinite(request.expiresAt) || request.expiresAt <= Date.now()) { await end('Session expired.'); return; }
        clearTimeout(handshake); session.deadline = Math.min(session.deadline, request.expiresAt); connecting = false; await chrome.storage.session.set({ relaySession: session }); await chrome.storage.session.remove('setupDraft'); await chrome.storage.local.set({ setupComplete: true }); if (socket !== ws) return;
        clearTimeout(expiryTimer); expiryTimer = setTimeout(() => end('Session expired.'), Math.max(0, session.deadline - Date.now())); clearInterval(heartbeat); heartbeat = setInterval(() => { if (socket === ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' })); }, 20000);
        status = policy.summary().needsChoice ? 'Connected. Choose agent permissions.' : 'Connected.'; note('Connected to ' + session.origin); if (policy.summary().needsChoice) policy.open().catch(() => { status = 'Connected. Open Agent permissions in the popup.'; }); return;
      }
      if (request.type !== 'request' || !/^[a-f0-9-]{36}$/.test(request.id || '') || !['list', 'call'].includes(request.operation)) return;
      const reply = result => { if (socket === ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'result', id: request.id, ...result })); };
      if (busy) { reply({ ok: false, error: 'BUSY. Do not automatically retry writes.' }); return; } busy = true;
      try {
        if (connecting || !session || session.deadline <= Date.now() || !binding) throw new Error('PAGE_NOT_READY.');
        const captured = { id: session.id, documentId: binding.documentId, scopeId: policy.summary().scopeId };
        const listing = await inspectTab(session.tabId, captured.documentId); if (socket !== ws || session?.id !== captured.id || binding?.documentId !== captured.documentId) throw new Error('Page/session changed.');
        if (request.operation === 'list') { reply({ ok: true, value: { origin: listing.origin, snapshot: listing.snapshot, tools: listing.tools } }); return; }
        if (paused) throw new Error('Execution paused.');
        if (policy.summary().needsChoice) throw new Error('Choose agent permissions in the extension dialog first.');
        const tool = listing.tools.find(t => t.tool_id === request.tool_id); if (!tool || listing.snapshot !== request.snapshot) throw new Error('REGISTRY_CHANGED: list tools again.');
        if (!request.arguments || typeof request.arguments !== 'object' || Array.isArray(request.arguments)) throw new Error('Arguments must be an object.');
        const toolKey = listing.metadataSnapshot + ':' + tool.tool_id; let decision = await policy.allowed(toolKey);
        if (!decision.allowed) decision = await new Promise(resolve => { const id = crypto.randomUUID(); const timer = setTimeout(rejectPending, 45000); pending = { id, origin: listing.origin, tool: tool.name, arguments: request.arguments, toolKey, scopeId: captured.scopeId, resolve, timer }; chrome.action.setBadgeBackgroundColor({ color: '#b7791f' }).catch(() => {}); chrome.action.setBadgeText({ text: '!' }).catch(() => {}); status = 'Approval required. Open the extension popup.'; });
        const p = policy.summary(); if (!decision.allowed || paused || p.needsChoice || p.scopeId !== captured.scopeId || p.revision !== decision.revision || socket !== ws || session?.id !== captured.id || binding?.documentId !== captured.documentId || session.deadline <= Date.now()) throw new Error('Denied, paused, expired, or permissions/page changed.');
        const value = await executeNative(session.tabId, listing, { tool_id: request.tool_id, arguments: request.arguments }); reply({ ok: true, value }); note('Completed ' + tool.name); status = 'Connected.';
      } catch (error) { reply({ ok: false, error: String(error.message || error).slice(0, 1500) }); note('Rejected/failed: ' + String(error.message || error)); } finally { busy = false; }
    };
  } catch (error) { if (generation === sequence) detach(error.message); }
}
chrome.runtime.onMessage.addListener((m, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.url?.split('?')[0] !== chrome.runtime.getURL('popup.html') || m?.type?.startsWith('policy-')) return;
  (async () => {
    await ready;
    if (m.type === 'state') return view(); if (m.type === 'inspect') return inspectTab(m.tabId);
    if (m.type === 'prepare') { const owner = m.owner || hex(crypto.getRandomValues(new Uint8Array(32))); if (!/^[A-Za-z0-9_-]{32,256}$/.test(owner)) throw new Error('Prepare a valid OWNER_SECRET.'); await chrome.storage.session.set({ setupDraft: { owner, relay: m.relay || '' } }); return { owner }; }
    if (m.type === 'connect') { await connect(m); return view(); } if (m.type === 'end') { await end(); return view(); }
    if (m.type === 'trust') { if (!binding || connecting || socket?.readyState !== WebSocket.OPEN || session?.id !== m.sessionId || binding.documentId !== m.documentId || paused) throw new Error('Page changed, disconnected, or paused.'); rejectPending(); await policy.choose(m.enabled ? 'session' : 'ask', policy.summary().scopeId); status = m.enabled ? 'Session trust enabled.' : 'Ask each time enabled.'; return view(); }
    if (m.type === 'pause') { if (!session || session.id !== m.sessionId || socket?.readyState !== WebSocket.OPEN) throw new Error('Session changed or disconnected.'); paused = m.enabled === true; if (paused) { rejectPending(); policy.invalidate(); } status = paused ? 'Execution paused.' : 'Execution resumed in ask-each-time mode.'; return view(); }
    if (m.type === 'approve') {
      if (!pending || pending.id !== m.id || pending.scopeId !== policy.summary().scopeId || paused) throw new Error('Approval expired or permissions changed.'); const task = pending; pending = null; clearTimeout(task.timer);
      try { if (m.allow === true && m.allowTool === true) policy.grantTool(task.toolKey, task.scopeId); task.resolve({ allowed: m.allow === true, revision: policy.summary().revision }); } catch (e) { task.resolve({ allowed: false }); throw e; }
      await chrome.action.setBadgeText({ text: '' }); return view();
    }
    if (m.type === 'save') { const relay = base(m.relay); const local = await chrome.storage.local.get('relayCredentials'); const owner = m.owner || local.relayCredentials?.[relay]; if (!/^[A-Za-z0-9_-]{32,256}$/.test(owner || '')) throw new Error('Enter this relay secret.'); await end('Settings saved. Connect explicitly.'); await chrome.storage.local.set({ relay, relayCredentials: { ...(local.relayCredentials || {}), [relay]: owner } }); return view(); }
    if (m.type === 'forget') { const relay = base(m.relay); const values = { ...((await chrome.storage.local.get('relayCredentials')).relayCredentials || {}) }; delete values[relay]; await end('Credential forgotten.'); await chrome.storage.local.set({ relayCredentials: values }); return view(); }
    if (m.type === 'reset') { await end('Setup reset.'); await chrome.storage.local.remove(['relay', 'relayCredentials', 'setupComplete', 'setupStep', 'preferredDock']); await chrome.storage.session.remove('setupDraft'); return view(); }
    throw new Error('Unsupported command.');
  })().then(value => respond({ ok: true, value }), e => respond({ ok: false, error: String(e.message || e) })); return true;
});
chrome.tabs.onUpdated.addListener((tabId, change) => { ready.then(async () => {
  if (!session || session.tabId !== tabId) return;
  if (change.url && new URL(change.url).origin !== session.origin) { await end('Origin changed.'); return; }
  if (change.status === 'loading') { binding = null; policy.clear(); rejectPending(); status = 'Page reloading. Key retained; execution blocked.'; }
  if (change.status === 'complete' && socket?.readyState === WebSocket.OPEN) { const generation = sequence, id = session.id; try { const listing = await inspectTab(tabId); if (generation !== sequence || session?.id !== id) return; if (listing.origin !== session.origin) { await end('Origin changed.'); return; } if (!listing.available || !listing.executable) throw new Error('No tools ready.'); binding = listing; await policy.bind({ sessionId: session.id, documentId: listing.documentId, origin: session.origin }); if (generation !== sequence) return; status = 'Page rebound. Same session key.'; if (policy.summary().needsChoice && !paused) policy.open().catch(() => {}); } catch (e) { if (generation === sequence) { binding = null; status = 'Page not ready. Resume after loading.'; } } }
}).catch(() => {}); });
chrome.tabs.onRemoved.addListener(id => { ready.then(() => { if (session?.tabId === id) return end('Target tab closed.'); }).catch(() => {}); });
export { ready, view, connect };
