const $ = id => document.getElementById(id);
const tabId = Number(new URL(location.href).searchParams.get('tab'));
let binding, ws, expires = 0, timer, heartbeat, handshake, pendingApproval, busy = false, generation = 0, trustedDocument = null;
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const storageReady = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
function log(text) { $('status').textContent = text; }
function activity(text) { $('log').textContent = (new Date().toISOString() + ' ' + text + '\n' + $('log').textContent).slice(0, 12000); }
function state(connecting = false) { window.dispatchEvent(new CustomEvent('relay-state', { detail: { connected: Boolean(ws && expires > Date.now()), connecting } })); }
function rejectApproval() { const resolve = pendingApproval; pendingApproval = null; $('approval').hidden = true; resolve?.(false); }
function revokeTrust() { trustedDocument = null; $('trust-session').checked = false; }
function stop(reason = 'Disconnected. Already-started code may still run.') { generation++; const old = ws; ws = null; old?.close(); clearTimeout(timer); clearTimeout(handshake); clearInterval(heartbeat); expires = 0; $('session').value = ''; rejectApproval(); revokeTrust(); $('paused').checked = false; log(reason); state(); }
function relayOrigin() { const url = new URL($('relay').value.trim()); if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Enter an HTTPS base URL without /mcp, query parameters or credentials.'); return url.origin; }
export async function loadSecret() {
  await storageReady; const origin = relayOrigin(); const data = await chrome.storage.local.get('relayCredentials'); const secret = data.relayCredentials?.[origin];
  if (secret) { $('owner').value = secret; $('credential-status').textContent = 'Saved secret loaded for ' + origin + '.'; }
  else { $('credential-status').textContent = 'No saved secret for this relay. Prepare or enter its OWNER_SECRET.'; }
  return secret;
}
export async function forgetSecret() {
  await storageReady; const origin = relayOrigin(); stop('Disconnected. Forgetting saved secret.');
  const data = await chrome.storage.local.get('relayCredentials'); const entries = { ...(data.relayCredentials || {}) }; delete entries[origin];
  await chrome.storage.local.set({ relayCredentials: entries }); $('owner').value = ''; $('credential-status').textContent = 'No secret saved for this relay.';
}
async function page(operation, request = {}) {
  if (!binding) throw new Error('No bound document. Select the target page using the extension toolbar.');
  const results = await chrome.scripting.executeScript({ target: { tabId, documentIds: [binding.documentId] }, world: 'MAIN', func: nativeOperation, args: [operation, binding.origin, request] });
  if (!results[0]?.result?.ok) throw new Error(results[0]?.result?.error || 'Native WebMCP unavailable or document changed');
  return results[0].result.value;
}
async function nativeOperation(operation, expectedOrigin, request) {
  try {
    if (location.origin !== expectedOrigin) throw new Error('Origin changed');
    const context = document.modelContext;
    if (!context || typeof context.getTools !== 'function' || typeof context.executeTool !== 'function') throw new Error('Native WebMCP getTools/executeTool unavailable; no fallback installed');
    const native = Array.from(await context.getTools()).filter(t => !t.origin || t.origin === expectedOrigin);
    if (native.length > 50) throw new Error('Too many tools');
    const tools = native.map((t, index) => ({ tool_id: String(index), name: String(t.name), description: String(t.description || ''), inputSchema: typeof t.inputSchema === 'string' ? JSON.parse(t.inputSchema) : t.inputSchema, ...(t.annotations ? { annotations: t.annotations } : {}) }));
    if (tools.some(t => !t.inputSchema || t.inputSchema.type !== 'object')) throw new Error('Unsupported inputSchema');
    const encoded = JSON.stringify(tools); if (encoded.length > 64000) throw new Error('Registry too large');
    const snapshot = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(encoded))), b => b.toString(16).padStart(2, '0')).join('');
    if (operation === 'list') return { ok: true, value: { origin: expectedOrigin, snapshot, tools } };
    if (request.snapshot !== snapshot) throw new Error('REGISTRY_CHANGED: list tools again');
    const index = tools.findIndex(t => t.tool_id === request.tool_id); if (index < 0) throw new Error('Tool not found');
    const result = await context.executeTool(native[index], request.arguments); const json = JSON.stringify(result === undefined ? null : result);
    if (json.length > 64000) throw new Error('Result too large; effects may already have occurred');
    return { ok: true, value: JSON.parse(json) };
  } catch (error) { return { ok: false, error: String(error.message || error).slice(0, 1500) }; }
}
async function bind() {
  const tab = await chrome.tabs.get(tabId); const origin = new URL(tab.url).origin;
  const result = (await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: 'MAIN', func: () => location.origin }))[0];
  if (!result?.documentId || result.result !== origin) throw new Error('Document changed during selection');
  binding = { origin, documentId: result.documentId }; $('target').textContent = 'Selected page: ' + origin + ' (tab ' + tabId + ').';
}
function approve(details) { $('details').textContent = JSON.stringify(details, null, 2); $('approval').hidden = false; return new Promise(resolve => { pendingApproval = resolve; }); }
$('allow').onclick = () => { const resolve = pendingApproval; pendingApproval = null; $('approval').hidden = true; resolve?.(true); };
$('deny').onclick = rejectApproval; $('stop').onclick = () => stop();
$('copy').onclick = async () => { try { if ($('session').value) await navigator.clipboard.writeText($('session').value); } catch { log('Copy failed. Select and copy the session key manually.'); } };
$('trust-session').onchange = () => {
  if (!$('trust-session').checked) { revokeTrust(); activity('Session trust revoked'); return; }
  if (!binding || !ws || expires <= Date.now() || $('paused').checked) { revokeTrust(); return; }
  trustedDocument = binding.documentId; activity('Explicit trust granted for ALL tools in ' + binding.origin + ' for this connection only');
};
$('paused').onchange = () => { if ($('paused').checked) { revokeTrust(); rejectApproval(); activity('Execution paused'); } else activity('Execution resumed in ask-every-time mode'); };
$('connect').onclick = async () => {
  let current;
  try {
    const origin = relayOrigin();
    const permission = chrome.permissions.request({ origins: [origin + '/*'] });
    stop('Preparing connection…'); current = generation; state(true);
    if (!(await permission)) throw new Error('Relay access permission was not granted.');
    await storageReady;
    const data = await chrome.storage.local.get('relayCredentials');
    const owner = $('owner').value || data.relayCredentials?.[origin];
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(owner || '')) throw new Error('Enter OWNER_SECRET: 32-256 letters, digits, underscores or hyphens.');
    log('Checking relay health…');
    const response = await fetch(origin + '/health', { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Relay health check returned HTTP ' + response.status);
    const health = await response.json(); if (health.name !== 'web-mcp-relay' || health.protocolVersion !== 1) throw new Error('Incompatible relay service');
    if (current !== generation) return;
    log('Checking native WebMCP on the selected page…'); await bind(); await page('list');
    if (current !== generation) return;
    await chrome.storage.local.set({ relay: origin, relayCredentials: { ...(data.relayCredentials || {}), [origin]: owner } });
    const key = hex(crypto.getRandomValues(new Uint8Array(32))); const session = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))));
    if (current !== generation) return;
    const socket = new WebSocket(origin.replace('https:', 'wss:') + '/browser?session=' + session, ['web-mcp-relay-v1', owner]);
    ws = socket; $('mcp').value = origin + '/mcp'; log('Connecting WebSocket…');
    handshake = setTimeout(() => { if (ws === socket) stop('WebSocket handshake timed out. Check the relay and OWNER_SECRET.'); }, 12000);
    socket.onerror = () => { if (ws === socket) log('WebSocket error. Check the relay URL, OWNER_SECRET and deployment.'); };
    socket.onclose = () => { if (ws === socket) stop('Relay disconnected. Your saved secret is retained; reconnect when ready.'); };
    socket.onmessage = async event => {
      if (ws !== socket) return;
      let m; try { if (typeof event.data !== 'string' || event.data.length > 128000) throw new Error(); m = JSON.parse(event.data); } catch { stop('Invalid relay frame'); return; }
      if (m.type === 'ready') {
        if (!Number.isFinite(m.expiresAt) || m.expiresAt <= Date.now()) { stop('Expired session'); return; }
        clearTimeout(handshake); expires = m.expiresAt; $('session').value = key; $('owner').value = ''; $('credential-status').textContent = 'Secret saved locally for ' + origin + '.';
        timer = setTimeout(() => stop('Session expired. Reconnect to create a new session.'), Math.min(3600000, expires - Date.now()));
        heartbeat = setInterval(() => { if (ws === socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' })); }, 25000);
        log('Connected. Session trust is off until you explicitly enable it.'); state(); return;
      }
      if (m.type !== 'request' || !/^[a-f0-9-]{36}$/.test(m.id || '') || !['list', 'call'].includes(m.operation)) return;
      const reply = result => { if (ws === socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'result', id: m.id, ...result })); };
      if (busy || expires <= Date.now()) { reply({ ok: false, error: 'BUSY_OR_EXPIRED' }); return; }
      busy = true;
      try {
        let value;
        if (m.operation === 'list') value = await page('list');
        else {
          if ($('paused').checked) throw new Error('Execution paused');
          const listing = await page('list'); const tool = listing.tools.find(t => t.tool_id === m.tool_id);
          if (!tool || listing.snapshot !== m.snapshot) throw new Error('REGISTRY_CHANGED: list tools again');
          if (!m.arguments || typeof m.arguments !== 'object' || Array.isArray(m.arguments)) throw new Error('arguments must be an object');
          const automatic = trustedDocument === binding.documentId && $('trust-session').checked;
          let allowed = automatic;
          if (!automatic) { const approvalTimer = setTimeout(rejectApproval, 45000); try { allowed = await approve({ origin: binding.origin, tool: tool.name, arguments: m.arguments }); } finally { clearTimeout(approvalTimer); } }
          if (!allowed || ws !== socket || expires <= Date.now() || $('paused').checked) throw new Error('Denied, paused, expired or disconnected');
          activity((automatic ? 'Trusted execution: ' : 'Approved execution: ') + tool.name);
          value = await page('call', { tool_id: m.tool_id, snapshot: m.snapshot, arguments: m.arguments });
        }
        reply({ ok: true, value }); activity('Completed ' + m.operation);
      } catch (error) { reply({ ok: false, error: String(error.message || error).slice(0, 1500) }); activity('Rejected/failed: ' + String(error.message || error)); }
      finally { busy = false; }
    };
  } catch (error) { if (current === undefined || current === generation) { log(String(error.message || error)); state(); } }
};
chrome.tabs.onUpdated.addListener((id, change) => { if (id === tabId && (change.status === 'loading' || change.url)) { binding = null; stop('Selected page navigated or reloaded. Trust revoked; reconnect and verify the target.'); } });
chrome.tabs.onRemoved.addListener(id => { if (id === tabId) { binding = null; stop('Selected page closed. Trust revoked.'); } });
window.addEventListener('pagehide', () => stop());
export const initialized = (async () => { await storageReady; const data = await chrome.storage.local.get('relay'); $('relay').value = data.relay || ''; if (data.relay) await loadSecret(); await bind(); })();
