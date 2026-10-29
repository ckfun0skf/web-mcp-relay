const $ = id => document.getElementById(id);
const tabId = Number(new URL(location.href).searchParams.get('tab'));
let binding, ws, expires = 0, expiryTimer, heartbeat, pendingApproval, busy = false;
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
function log(text) { $('status').textContent = text; }
function rejectApproval() { if (pendingApproval) { pendingApproval(false); pendingApproval = null; } $('approval').hidden = true; }
function stop(reason = 'Disconnected. Already-started page code may still run.') {
  const old = ws; ws = null; old?.close(); clearTimeout(expiryTimer); clearInterval(heartbeat); expires = 0; $('session').value = ''; rejectApproval(); log(reason);
}
async function page(operation, request = {}) {
  if (!binding) throw new Error('Target document not bound');
  const results = await chrome.scripting.executeScript({ target: { tabId, documentIds: [binding.documentId] }, world: 'MAIN', func: nativeOperation, args: [operation, binding.origin, request] });
  const response = results[0]?.result;
  if (!response?.ok) throw new Error(response?.error || 'Native WebMCP unavailable or document changed');
  return response.value;
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
    const encoded = JSON.stringify(tools);
    if (encoded.length > 64000) throw new Error('Registry too large');
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(encoded)));
    const snapshot = Array.from(hash, b => b.toString(16).padStart(2, '0')).join('');
    if (operation === 'list') return { ok: true, value: { origin: expectedOrigin, snapshot, tools } };
    if (request.snapshot !== snapshot) throw new Error('REGISTRY_CHANGED: list tools again');
    const index = tools.findIndex(t => t.tool_id === request.tool_id);
    if (index < 0) throw new Error('Tool not found');
    const result = await context.executeTool(native[index], request.arguments);
    const value = result === undefined ? null : result;
    const json = JSON.stringify(value);
    if (json.length > 64000) throw new Error('Result too large; effects may already have occurred');
    return { ok: true, value: JSON.parse(json) };
  } catch (error) { return { ok: false, error: String(error.message || error).slice(0, 1500) }; }
}
async function bind() {
  const tab = await chrome.tabs.get(tabId);
  const origin = new URL(tab.url).origin;
  const results = await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: 'MAIN', func: () => location.origin });
  if (!results[0]?.documentId || results[0].result !== origin) throw new Error('Document changed during selection');
  binding = { origin, documentId: results[0].documentId };
  $('target').textContent = 'Bound page: ' + origin + ' (tab ' + tabId + '). Navigation requires selecting again.';
}
function approve(details) {
  $('details').textContent = JSON.stringify(details, null, 2); $('approval').hidden = false;
  return new Promise(resolve => { pendingApproval = resolve; });
}
$('allow').onclick = () => { const resolve = pendingApproval; pendingApproval = null; $('approval').hidden = true; resolve?.(true); };
$('deny').onclick = rejectApproval;
$('stop').onclick = () => stop();
$('copy').onclick = async () => { try { if ($('session').value) await navigator.clipboard.writeText($('session').value); } catch { log('Copy failed; select and copy the session key manually.'); } };
$('connect').onclick = async () => {
  try {
    stop(); await bind(); await page('list');
    const url = new URL($('relay').value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Enter only an HTTPS base origin, no path/query');
    const owner = $('owner').value;
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(owner)) throw new Error('OWNER_SECRET must be 32-256 URL-safe letters, digits, _ or -');
    await chrome.storage.local.set({ relay: url.origin });
    const key = hex(crypto.getRandomValues(new Uint8Array(32)));
    const session = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))));
    const socket = new WebSocket(url.origin.replace('https:', 'wss:') + '/browser?session=' + session, ['web-mcp-relay-v1', owner]);
    ws = socket; $('owner').value = ''; $('mcp').value = url.origin + '/mcp'; log('Connecting…');
    const connectTimer = setTimeout(() => { if (ws === socket && !expires) stop('Handshake timeout'); }, 12000);
    socket.onclose = () => { clearTimeout(connectTimer); if (ws === socket) stop('Relay disconnected; reconnect to create a new session.'); };
    socket.onerror = () => { if (ws === socket) log('Connection failed; check URL, OWNER_SECRET and deployment.'); };
    socket.onmessage = async event => {
      if (ws !== socket) return;
      let m; try { if (typeof event.data !== 'string' || event.data.length > 128000) throw new Error(); m = JSON.parse(event.data); } catch { stop('Invalid relay frame'); return; }
      if (m.type === 'ready') {
        if (!Number.isFinite(m.expiresAt) || m.expiresAt <= Date.now()) { stop('Expired session'); return; }
        clearTimeout(connectTimer); expires = m.expiresAt; $('session').value = key; log('Connected. Copy MCP URL and session key to your MCP client.');
        expiryTimer = setTimeout(() => stop('Session expired'), Math.min(3600000, expires - Date.now()));
        heartbeat = setInterval(() => { if (ws === socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' })); }, 25000); return;
      }
      if (m.type !== 'request' || !/^[a-f0-9-]{36}$/.test(m.id || '') || !['list', 'call'].includes(m.operation)) return;
      const reply = data => { if (ws === socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'result', id: m.id, ...data })); };
      if (busy || Date.now() >= expires) { reply({ ok: false, error: 'BUSY_OR_EXPIRED' }); return; }
      busy = true;
      try {
        let value;
        if (m.operation === 'list') value = await page('list');
        else {
          const listing = await page('list');
          const tool = listing.tools.find(t => t.tool_id === m.tool_id);
          if (!tool || m.snapshot !== listing.snapshot) throw new Error('REGISTRY_CHANGED: list tools again');
          if (!m.arguments || typeof m.arguments !== 'object' || Array.isArray(m.arguments)) throw new Error('arguments must be an object');
          const timer = setTimeout(rejectApproval, 45000);
          let allowed;
          try { allowed = await approve({ origin: binding.origin, tool: tool.name, arguments: m.arguments }); } finally { clearTimeout(timer); }
          if (!allowed || ws !== socket || Date.now() >= expires) throw new Error('Denied, expired or disconnected');
          value = await page('call', { tool_id: m.tool_id, snapshot: m.snapshot, arguments: m.arguments });
        }
        reply({ ok: true, value }); log('Completed ' + m.operation);
      } catch (error) { reply({ ok: false, error: String(error.message || error).slice(0, 1500) }); log(String(error.message || error)); }
      finally { busy = false; }
    };
  } catch (error) { log(String(error.message || error)); }
};
window.addEventListener('pagehide', () => stop());
chrome.storage.local.get('relay').then(data => { $('relay').value = data.relay || ''; });
bind().catch(error => log(String(error.message || error)));
