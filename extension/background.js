import { inspectTab, executeNative } from './native.js';
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
let session = null, socket = null, binding = null, trusted = false, paused = false, connecting = false, busy = false, pending = null, sequence = 0, heartbeat, expiryTimer, handshake;
let status = 'Not connected', activity = [];
const ready = (async () => {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const local = await chrome.storage.local.get(['relay', 'relayCredentials', 'setupComplete']);
  if (local.relay && local.relayCredentials?.[local.relay]) await chrome.storage.local.set({ setupComplete: true });
  const saved = await chrome.storage.session.get('relaySession');
  if (saved.relaySession?.deadline > Date.now()) { session = saved.relaySession; status = 'Background restarted. Resume the saved session to reconnect; trust was revoked.'; }
  else await chrome.storage.session.remove('relaySession');
})();
function note(text) { activity.unshift(new Date().toISOString() + ' ' + text); activity = activity.slice(0, 40); }
function rejectPending() { if (pending) { clearTimeout(pending.timer); pending.resolve(false); pending = null; } chrome.action.setBadgeText({ text: '' }).catch(() => {}); }
function detach(text) { sequence++; clearInterval(heartbeat); clearTimeout(expiryTimer); clearTimeout(handshake); const old = socket; socket = null; old?.close(); binding = null; trusted = false; paused = false; connecting = false; rejectPending(); status = text; }
async function end(text = 'Session ended.') { detach(text); session = null; await chrome.storage.session.remove('relaySession'); }
function base(value) { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Use an HTTPS base URL without /mcp or credentials.'); return url.origin; }
async function view() {
  if (session && session.deadline <= Date.now()) await end('Session expired.');
  const local = await chrome.storage.local.get(['relay', 'relayCredentials', 'setupComplete']);
  const draft = await chrome.storage.session.get('setupDraft');
  return { setupComplete: Boolean(local.setupComplete), relay: local.relay || '', hasSecret: Boolean(local.relayCredentials?.[local.relay]), draft: draft.setupDraft || {}, session, connected: Boolean(socket?.readyState === WebSocket.OPEN && binding && session?.deadline > Date.now()), transportConnected: socket?.readyState === WebSocket.OPEN, connecting, trusted, paused, status, documentId: binding?.documentId, pending: pending ? { id: pending.id, origin: pending.origin, tool: pending.tool, arguments: pending.arguments } : null, activity };
}
async function connect(m) {
  if (connecting) throw new Error('A connection attempt is already in progress.');
  const relay = base(m.relay);
  const local = await chrome.storage.local.get(['relayCredentials', 'setupComplete']);
  const secret = m.owner || local.relayCredentials?.[relay];
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret || '')) throw new Error('Enter OWNER_SECRET (32-256 URL-safe letters, digits, _ or -).');
  const oldSession = session; detach('Checking relay health…'); connecting = true; const current = sequence;
  try {
    const response = await fetch(relay + '/health', { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Relay health returned HTTP ' + response.status);
    const health = await response.json(); if (health.name !== 'web-mcp-relay' || health.protocolVersion !== 1) throw new Error('Incompatible relay service.');
    if (current !== sequence) return;
    status = 'Checking native WebMCP…'; const selected = await inspectTab(m.tabId, m.documentId);
    if (!selected.available || !selected.executable) throw new Error('Native WebMCP discovery/execution is unavailable on this page.');
    if (current !== sequence) return;
    const reusable = oldSession && oldSession.relay === relay && oldSession.tabId === m.tabId && oldSession.origin === selected.origin && oldSession.deadline > Date.now();
    session = reusable ? oldSession : { key: hex(crypto.getRandomValues(new Uint8Array(32))), relay, tabId: m.tabId, origin: selected.origin, deadline: Date.now() + 3600000, id: crypto.randomUUID() };
    binding = selected; trusted = false; paused = false;
    await chrome.storage.session.set({ relaySession: session });
    await chrome.storage.local.set({ relay, relayCredentials: { ...(local.relayCredentials || {}), [relay]: secret } });
    if (current !== sequence) return;
    const route = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(session.key))));
    if (current !== sequence) return;
    const ws = new WebSocket(relay.replace('https:', 'wss:') + '/browser?session=' + route, ['web-mcp-relay-v1', secret]);
    socket = ws; status = reusable ? 'Resuming saved session…' : 'Connecting…';
    handshake = setTimeout(() => { if (socket === ws) detach('Handshake timed out. Check the relay, key, or a previous socket still closing. Resume to retry.'); }, 12000);
    ws.onerror = () => { if (socket === ws) status = 'WebSocket error. Check the relay and OWNER_SECRET.'; };
    ws.onclose = () => { if (socket === ws) detach('Connection lost. Saved key retained until expiry; select Resume. Unknown-outcome tool calls are not retried.'); };
    ws.onmessage = async event => {
      if (socket !== ws) return;
      let m; try { if (typeof event.data !== 'string' || event.data.length > 128000) throw new Error(); m = JSON.parse(event.data); } catch { await end('Invalid relay frame.'); return; }
      if (m.type === 'ready') {
        if (!session || !Number.isFinite(m.expiresAt) || m.expiresAt <= Date.now()) { await end('Expired relay session.'); return; }
        clearTimeout(handshake); session.deadline = Math.min(session.deadline, m.expiresAt); connecting = false;
        await chrome.storage.session.set({ relaySession: session }); await chrome.storage.session.remove('setupDraft'); await chrome.storage.local.set({ setupComplete: true });
        if (socket !== ws) return;
        expiryTimer = setTimeout(() => end('Session expired.'), Math.max(0, session.deadline - Date.now()));
        clearInterval(heartbeat); heartbeat = setInterval(() => { if (socket === ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' })); }, 20000);
        status = 'Connected in background. This popup can be closed.'; note('Connected to ' + session.origin); return;
      }
      if (m.type !== 'request' || !/^[a-f0-9-]{36}$/.test(m.id || '') || !['list', 'call'].includes(m.operation)) return;
      const reply = value => { if (socket === ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'result', id: m.id, ...value })); };
      if (busy) { reply({ ok: false, error: 'BUSY. Do not automatically retry a write.' }); return; }
      busy = true;
      try {
        if (!session || session.deadline <= Date.now() || !binding) throw new Error('PAGE_NOT_READY: wait for reload to finish, then list tools again.');
        const captured = { sessionId: session.id, documentId: binding.documentId };
        const listing = await inspectTab(session.tabId, captured.documentId);
        if (socket !== ws || session?.id !== captured.sessionId || binding?.documentId !== captured.documentId) throw new Error('Page/session changed.');
        if (m.operation === 'list') { reply({ ok: true, value: { origin: listing.origin, snapshot: listing.snapshot, tools: listing.tools } }); return; }
        if (paused) throw new Error('Execution paused.');
        if (listing.snapshot !== m.snapshot || !listing.tools.some(t => t.tool_id === m.tool_id)) throw new Error('REGISTRY_CHANGED: list tools again.');
        if (!m.arguments || typeof m.arguments !== 'object' || Array.isArray(m.arguments)) throw new Error('Arguments must be an object.');
        let allowed = trusted;
        if (!allowed) {
          const tool = listing.tools.find(t => t.tool_id === m.tool_id);
          allowed = await new Promise(resolve => { const id = crypto.randomUUID(); const timer = setTimeout(rejectPending, 45000); pending = { id, origin: listing.origin, tool: tool.name, arguments: m.arguments, resolve, timer }; chrome.action.setBadgeBackgroundColor({ color: '#b7791f' }).catch(() => {}); chrome.action.setBadgeText({ text: '!' }).catch(() => {}); status = 'Approval required. Click the extension icon.'; });
        }
        if (!allowed || paused || socket !== ws || session?.id !== captured.sessionId || binding?.documentId !== captured.documentId || session.deadline <= Date.now()) throw new Error('Denied, paused, expired, or page changed.');
        const value = await executeNative(session.tabId, listing, { tool_id: m.tool_id, arguments: m.arguments });
        reply({ ok: true, value }); note('Completed ' + listing.tools.find(t => t.tool_id === m.tool_id).name);
      } catch (error) { reply({ ok: false, error: String(error.message || error).slice(0, 1500) }); note('Rejected/failed: ' + String(error.message || error)); }
      finally { busy = false; }
    };
  } catch (error) { if (current === sequence) detach(String(error.message || error)); }
}
chrome.runtime.onMessage.addListener((m, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.url?.split('?')[0] !== chrome.runtime.getURL('popup.html')) return;
  (async () => {
    await ready;
    if (m.type === 'state') return view();
    if (m.type === 'inspect') return inspectTab(m.tabId);
    if (m.type === 'prepare') { const owner = m.owner || hex(crypto.getRandomValues(new Uint8Array(32))); if (!/^[A-Za-z0-9_-]{32,256}$/.test(owner)) throw new Error('Prepare a valid OWNER_SECRET.'); await chrome.storage.session.set({ setupDraft: { owner, relay: m.relay || '' } }); return { owner }; }
    if (m.type === 'connect') { await connect(m); return view(); }
    if (m.type === 'end') { await end(); return view(); }
    if (m.type === 'trust') { if (!socket || !binding || session?.id !== m.sessionId || binding.documentId !== m.documentId) throw new Error('Session/page changed. Refresh the popup.'); trusted = Boolean(m.enabled); if (paused) trusted = false; note(trusted ? 'Explicit session trust enabled for all tools.' : 'Trust revoked.'); return view(); }
    if (m.type === 'pause') { paused = Boolean(m.enabled); if (paused) { trusted = false; rejectPending(); } return view(); }
    if (m.type === 'approve') { if (!pending || pending.id !== m.id) throw new Error('Approval expired.'); const task = pending; pending = null; clearTimeout(task.timer); task.resolve(m.allow === true); await chrome.action.setBadgeText({ text: '' }); return view(); }
    if (m.type === 'save') {
      const relay = base(m.relay); const local = await chrome.storage.local.get('relayCredentials'); const owner = m.owner || local.relayCredentials?.[relay];
      if (!/^[A-Za-z0-9_-]{32,256}$/.test(owner || '')) throw new Error('Enter the secret for this relay.');
      await end('Settings changed. Connect explicitly to start a session.'); await chrome.storage.local.set({ relay, relayCredentials: { ...(local.relayCredentials || {}), [relay]: owner } }); return view();
    }
    if (m.type === 'forget') { const relay = base(m.relay); const local = await chrome.storage.local.get('relayCredentials'); const values = { ...(local.relayCredentials || {}) }; delete values[relay]; await end('Credential forgotten.'); await chrome.storage.local.set({ relayCredentials: values }); return view(); }
    if (m.type === 'reset') { await end('Setup reset.'); await chrome.storage.local.remove(['relay', 'relayCredentials', 'setupComplete', 'setupStep', 'preferredDock']); await chrome.storage.session.remove('setupDraft'); return view(); }
    throw new Error('Unsupported command.');
  })().then(value => respond({ ok: true, value }), error => respond({ ok: false, error: String(error.message || error) })); return true;
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  ready.then(async () => {
    if (!session || session.tabId !== tabId) return;
    if (change.url && new URL(change.url).origin !== session.origin) { await end('Target navigated to another origin. Session ended.'); return; }
    if (change.status === 'loading') { binding = null; trusted = false; rejectPending(); status = 'Page reloading. Session key retained; execution paused until reinspection.'; }
    if (change.status === 'complete' && socket?.readyState === WebSocket.OPEN) {
      const current = sequence; const id = session.id;
      try { const listing = await inspectTab(tabId); if (current !== sequence || session?.id !== id) return; if (listing.origin !== session.origin) { await end('Origin changed.'); return; } if (!listing.available || !listing.executable) throw new Error('WebMCP not ready.'); binding = listing; trusted = false; status = 'Page rebound. Same session key; trust must be enabled again.'; }
      catch (error) { if (current === sequence) { binding = null; status = 'Page not ready: ' + error.message + ' Select Resume after the page is ready.'; } }
    }
  }).catch(() => {});
});
chrome.tabs.onRemoved.addListener(tabId => { ready.then(() => { if (session?.tabId === tabId) return end('Target tab closed.'); }).catch(() => {}); });
