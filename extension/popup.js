const $ = id => document.getElementById(id);
let state, candidate, editing = false, initialized = false, working = false;
async function rpc(type, extra = {}) { const r = await chrome.runtime.sendMessage({ type, ...extra }); if (!r?.ok) throw new Error(r?.error || 'Background unavailable. Reload the extension if needed.'); return r.value; }
function notice(text) { $('notice').textContent = text; }
function node(tag, text) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; return el; }
const supportCard = node('section');
supportCard.className = 'card'; supportCard.hidden = true; supportCard.setAttribute('aria-labelledby', 'webmcp-support-title');
const supportTitle = node('h2', 'This page supports WebMCP'); supportTitle.id = 'webmcp-support-title';
const supportDescription = node('p'); supportDescription.className = 'hint';
const connectNow = node('button', 'Connect now'); connectNow.className = 'primary'; connectNow.type = 'button';
supportCard.append(supportTitle, supportDescription, connectNow); $('notice').after(supportCard);
function renderSupport() {
  const currentConnected = Boolean(state.connected && candidate && state.session?.tabId === candidate.tabId && state.session?.origin === candidate.origin && state.documentId === candidate.documentId);
  supportCard.hidden = editing || !candidate?.available || currentConnected;
  const count = candidate?.tools?.length || 0;
  const ready = Boolean(candidate?.executable && count > 0);
  const otherConnected = Boolean(state.transportConnected && state.session && candidate && state.session.tabId !== candidate.tabId);
  supportDescription.textContent = !ready ? 'WebMCP was detected, but no executable tools are ready yet. Refresh discovery after the page finishes loading.' : otherConnected ? `${count} tool${count === 1 ? '' : 's'} detected. Another page is connected. Connecting here will replace that session after confirmation.` : !state.setupComplete || !state.hasSecret ? `${count} tool${count === 1 ? '' : 's'} detected. Complete your relay settings to connect this page.` : `${count} tool${count === 1 ? '' : 's'} detected. Connect this page to make its tools available through your private relay.`;
  connectNow.textContent = state.connecting ? 'Connecting…' : 'Connect now';
  connectNow.disabled = working || state.connecting || !ready;
  $('connect').hidden = !supportCard.hidden || currentConnected;
}
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
  renderSupport();
}
async function update() { state = await rpc('state'); if (!initialized) { $('relay').value = state.draft.relay || state.relay; $('owner').value = state.draft.owner || ''; initialized = true; if (!state.setupComplete && !$('owner').value) { const d = await rpc('prepare'); $('owner').value = d.owner; } } render(); }
async function scan() {
  candidate = null; if (state) render(); $('tools').replaceChildren(); $('refresh').disabled = true; $('discovery-status').textContent = 'Inspecting native WebMCP…';
  try { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); if (!tab?.id) throw new Error('Select a webpage.'); candidate = await rpc('inspect', { tabId: tab.id }); candidate.tabId = tab.id; $('page').textContent = candidate.origin;
    $('discovery-status').textContent = !candidate.available ? 'Native WebMCP unavailable' : candidate.tools.length ? candidate.tools.length + ' tools detected' : 'WebMCP available; no tools exposed';
    for (const tool of candidate.tools) { const card = node('article'); card.className = 'tool-card'; card.append(node('h2', tool.name), node('p', tool.description)); const details = node('details'); details.append(node('summary', 'Parameters / input schema'), node('pre', JSON.stringify(tool.inputSchema, null, 2))); card.append(details); $('tools').append(card); }
  } catch (error) { $('discovery-status').textContent = error.message; } finally { $('refresh').disabled = false; if (state) render(); }
}
async function run(fn) { if (working) return; working = true; if (state) render(); try { await fn(); await update(); } catch (error) { notice(error.message); } finally { working = false; if (state) render(); } }
async function permission(relay) { const url = new URL(relay); if (url.protocol !== 'https:') throw new Error('Use HTTPS.'); if (!(await chrome.permissions.request({ origins: [url.origin + '/*'] }))) throw new Error('Relay access was not granted.'); }
function beginConnect(resume = false, fromSettings = false) {
  if (working || state.connecting) return;
  const selected = candidate;
  if (!resume && !selected?.documentId) { notice('Refresh current-page discovery first.'); return; }
  if (!resume && state.transportConnected && state.session && (state.session.tabId !== selected.tabId || state.session.origin !== selected.origin) && !confirm('Replace the connection to ' + state.session.origin + ' (tab ' + state.session.tabId + ') with this page? The previous session will disconnect.')) return;
  const relay = fromSettings ? $('relay').value.trim() : resume ? state.session?.relay : state.relay;
  const owner = fromSettings ? $('owner').value : '';
  run(async () => { await permission(relay); let target = selected; if (resume) { target = await rpc('inspect', { tabId: state.session.tabId }); target.tabId = state.session.tabId; } if (!target?.documentId) throw new Error('Refresh current-page discovery first.'); state = await rpc('connect', { relay, owner, tabId: target.tabId, documentId: target.documentId }); notice('Connection request sent. Status appears below.'); if (state.setupComplete) editing = false; });
}
connectNow.onclick = () => {
  if (!state || working || state.connecting) return;
  if (!state.setupComplete || !state.hasSecret) { editing = state.setupComplete; render(); notice('Complete your relay URL and OWNER_SECRET, then choose Verify & connect this page.'); $('setup').scrollIntoView({ block: 'start', behavior: 'smooth' }); (state.relay ? $('owner') : $('relay')).focus(); return; }
  beginConnect();
};
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
