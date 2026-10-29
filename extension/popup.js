const $ = id => document.getElementById(id);
let state, candidate, editing = false, initialized = false, working = false;
async function rpc(type, extra = {}) { const r = await chrome.runtime.sendMessage({ type, ...extra }); if (!r?.ok) throw new Error(r?.error || 'Background unavailable. Reload the extension if needed.'); return r.value; }
function notice(text) { $('notice').textContent = text; }
function node(tag, text) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; return el; }
function render() {
  const configured = state.setupComplete;
  $('setup').hidden = configured && !editing; $('dashboard').hidden = !configured || editing; $('settings').hidden = !configured;
  $('setup-title').textContent = configured ? 'Relay settings' : 'Prepare your private relay'; $('cancel').hidden = !configured; $('advanced').hidden = !configured;
  $('connection-status').textContent = state.status; $('relay-name').textContent = state.relay;
  $('target').textContent = state.session ? 'Session target: ' + state.session.origin + ' · tab ' + state.session.tabId : 'No active session';
  $('session-controls').hidden = !state.session; $('session-key').value = state.session?.key || ''; $('mcp').value = state.session ? state.session.relay + '/mcp' : '';
  $('expiry').textContent = state.session ? 'Expires: ' + new Date(state.session.deadline).toLocaleTimeString() : '';
  $('trust').checked = state.trusted; $('trust').disabled = !state.connected || state.paused; $('pause').checked = state.paused; $('pause').disabled = !state.transportConnected;
  $('resume').hidden = !state.session || state.connecting; $('end').disabled = !state.session && !state.connecting;
  $('connect').disabled = working || state.connecting || !candidate?.available || !candidate?.executable; $('setup-connect').disabled = working || state.connecting || !candidate?.available || !candidate?.executable;
  $('approval').hidden = !state.pending; $('approval-details').textContent = state.pending ? JSON.stringify(state.pending, null, 2) : ''; $('activity').textContent = state.activity.join('\n');
}
async function update() { state = await rpc('state'); if (!initialized) { $('relay').value = state.draft.relay || state.relay; $('owner').value = state.draft.owner || ''; initialized = true; if (!state.setupComplete && !$('owner').value) { const d = await rpc('prepare'); $('owner').value = d.owner; } } render(); }
async function scan() {
  candidate = null; $('tools').replaceChildren(); $('refresh').disabled = true; $('discovery-status').textContent = 'Inspecting native WebMCP…';
  try { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); if (!tab?.id) throw new Error('Select a webpage.'); candidate = await rpc('inspect', { tabId: tab.id }); candidate.tabId = tab.id; $('page').textContent = candidate.origin;
    $('discovery-status').textContent = !candidate.available ? 'Native WebMCP unavailable' : candidate.tools.length ? candidate.tools.length + ' tools detected' : 'WebMCP available; no tools exposed';
    for (const tool of candidate.tools) { const card = node('article'); card.className = 'tool-card'; card.append(node('h2', tool.name), node('p', tool.description)); const details = node('details'); details.append(node('summary', 'Parameters / input schema'), node('pre', JSON.stringify(tool.inputSchema, null, 2))); card.append(details); $('tools').append(card); }
  } catch (error) { $('discovery-status').textContent = error.message; } finally { $('refresh').disabled = false; if (state) render(); }
}
async function run(fn) { if (working) return; working = true; try { await fn(); await update(); } catch (error) { notice(error.message); } finally { working = false; if (state) render(); } }
async function permission(relay) { const url = new URL(relay); if (url.protocol !== 'https:') throw new Error('Use HTTPS.'); if (!(await chrome.permissions.request({ origins: [url.origin + '/*'] }))) throw new Error('Relay access was not granted.'); }
function beginConnect(resume = false, fromSettings = false) {
  const relay = fromSettings ? $('relay').value.trim() : resume ? state.session?.relay : state.relay;
  const permit = permission(relay);
  run(async () => { await permit; let target = candidate; if (resume) { target = await rpc('inspect', { tabId: state.session.tabId }); target.tabId = state.session.tabId; } if (!target?.documentId) throw new Error('Refresh current-page discovery first.'); state = await rpc('connect', { relay, owner: fromSettings ? $('owner').value : '', tabId: target.tabId, documentId: target.documentId }); notice('Connection request sent. Status appears below.'); if (state.setupComplete) editing = false; });
}
$('connect').onclick = () => beginConnect(); $('setup-connect').onclick = () => beginConnect(false, true); $('resume').onclick = () => beginConnect(true);
$('refresh').onclick = scan; $('settings').onclick = () => { editing = true; $('relay').value = state.relay; $('owner').value = ''; render(); }; $('cancel').onclick = () => { editing = false; render(); };
$('generate').onclick = () => run(async () => { if ($('owner').value && !confirm('Replace this prepared secret? Cloudflare must use the same value.')) return; const d = await rpc('prepare', { relay: $('relay').value.trim() }); $('owner').value = d.owner; notice('Secret prepared.'); });
$('deploy').onclick = () => run(async () => { const d = await rpc('prepare', { owner: $('owner').value, relay: $('relay').value.trim() }); await navigator.clipboard.writeText(d.owner); const url = new URL('https://deploy.workers.cloudflare.com/'); url.searchParams.set('url', 'https://github.com/ckfun0skf/web-mcp-relay'); await chrome.windows.create({ url: url.href, type: 'popup', width: 1000, height: 800 }); });
$('save').onclick = () => run(async () => { state = await rpc('save', { relay: $('relay').value.trim(), owner: $('owner').value }); $('owner').value = ''; if (state.setupComplete) editing = false; notice('Settings saved. Connect explicitly when ready.'); });
$('forget').onclick = () => run(async () => { if (!confirm('End the session and forget this relay secret?')) return; state = await rpc('forget', { relay: $('relay').value.trim() }); $('owner').value = ''; notice('Secret forgotten. Enter it again in Settings when needed.'); });
$('reset').onclick = () => run(async () => { if (!confirm('End the session and clear all saved relay credentials and setup on this device? Cloudflare resources will not be deleted.')) return; state = await rpc('reset'); initialized = false; editing = false; notice('Setup reset.'); });
$('end').onclick = () => run(async () => { await rpc('end'); notice('Session ended. The old key has no connected browser route.'); });
$('trust').onchange = () => run(() => rpc('trust', { enabled: $('trust').checked, sessionId: state.session?.id, documentId: state.documentId })); $('pause').onchange = () => run(() => rpc('pause', { enabled: $('pause').checked }));
$('allow').onclick = () => run(() => rpc('approve', { id: state.pending?.id, allow: true })); $('deny').onclick = () => run(() => rpc('approve', { id: state.pending?.id, allow: false }));
$('copy-mcp').onclick = () => navigator.clipboard.writeText($('mcp').value).then(() => notice('MCP URL copied.'), () => notice('Copy failed. Select the URL manually.'));
$('copy-key').onclick = () => navigator.clipboard.writeText($('session-key').value).then(() => notice('Session key copied. Share only with your trusted client.'), () => notice('Copy failed. Select the key manually.'));
setInterval(() => { if (!working) update().catch(error => notice(error.message)); }, 1000);
update().then(() => { notice('Popup UI is independent of the background connection.'); return scan(); }).catch(error => notice(error.message));
