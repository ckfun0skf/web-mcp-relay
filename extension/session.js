import { formatAgentActivity } from './agent-activity.mjs';
import { sessionStage, canCopySession } from './session-flow.mjs';
const $ = id => document.getElementById(id); const params = new URLSearchParams(location.search), sessionId = params.get('session');
let latest, current, polling = false, busy = false, editing = params.get('permissions') === '1';
async function rpc(type, extra = {}) { const r = await chrome.runtime.sendMessage({ type, sessionId, ...extra }); if (!r?.ok) throw new Error(r?.error || 'Background unavailable.'); return r.value; }
function clearCopy() { current = null; $('key').value = ''; $('key').type = 'password'; $('mcp').value = ''; $('copy-key').disabled = true; $('copy-details').disabled = true; }
async function update() {
  if (polling || busy) return; polling = true;
  try { const s = await rpc('session-handoff'); latest = s; const stage = sessionStage(s); const choosing = stage === 'permissions' || (editing && stage === 'ready');
    $('status').textContent = stage === 'ended' ? 'Session ended' : stage === 'connecting' ? 'Connecting to relay…' : stage === 'retry' ? 'Connection needs attention' : choosing ? 'Connected · Choose agent permissions' : s.paused ? 'Relay connected · Execution paused' : 'Connected · Ready to copy';
    $('target').textContent = s.name ? s.name + ' · ' + s.origin : s.origin || ''; const label = formatAgentActivity(s); $('agent').textContent = s.ended ? '' : 'Agent · ' + label;
    $('error').textContent = s.error || ''; $('error').hidden = !s.error; $('retry').hidden = stage !== 'retry'; $('retry').disabled = false;
    $('permissions').hidden = !choosing; $('cancel-permissions').hidden = s.needsChoice; $('handoff').hidden = stage !== 'ready' || choosing; $('change-permissions').hidden = stage !== 'ready' || choosing;
    for (const id of ['ask', 'session', 'website', 'cancel-permissions', 'change-permissions']) $(id).disabled = false;
    $('expiry').textContent = s.ended ? '' : 'No automatic expiry';
    if (canCopySession(s) && !choosing) { current = s; $('key').value = s.key; $('mcp').value = s.mcp; $('copy-key').disabled = false; $('copy-details').disabled = false; } else clearCopy();
  } catch (e) { clearCopy(); $('handoff').hidden = true; $('permissions').hidden = true; $('status').textContent = 'Unable to load this session'; $('error').hidden = false; $('error').textContent = e.message; }
  finally { polling = false; }
}
async function run(task) { if (busy) return; busy = true; document.querySelectorAll('button').forEach(b => b.disabled = true); try { await task(); } catch (e) { $('feedback').textContent = e.message; } finally { busy = false; await update(); } }
for (const mode of ['ask', 'session', 'website']) $(mode).onclick = () => { const scopeId = latest?.scope; run(async () => { await rpc('policy-choose', { scopeId, mode }); editing = false; $('feedback').textContent = 'Permissions saved. Copy your session below.'; }); };
$('retry').onclick = () => { const relay = latest?.relay; run(async () => { if (!relay || !(await chrome.permissions.request({ origins: [relay + '/*'] }))) throw new Error('Relay access is required.'); await rpc('reconnect'); $('feedback').textContent = 'Retry started. This session keeps its key.'; }); };
$('change-permissions').onclick = () => { if (!busy) { editing = true; update(); } }; $('cancel-permissions').onclick = () => { if (!busy) { editing = false; update(); } };
function copy(details) { if (!current || !canCopySession(current)) { $('feedback').textContent = 'Wait for connection and choose permissions first.'; return; } const text = details ? 'Web MCP Relay connector\nMCP server URL: ' + current.mcp + '\nAuthentication: None (this MVP uses session_key in tool arguments).\nSession key: ' + current.key + '\nNo automatic expiry. End session when finished.\nAfter connector setup, call list_browser_tools with ' + JSON.stringify({ session_key: current.key }) + ', then call_browser_tool with the returned tool_id, snapshot and arguments. Never automatically retry writes with unknown outcomes.' : current.key; navigator.clipboard.writeText(text).then(() => $('feedback').textContent = 'Copied. Paste only into your trusted AI agent.', () => { $('key').type = 'text'; $('key').focus(); $('key').select(); $('feedback').textContent = 'Select and copy the key manually. The MCP URL is shown below it.'; }); }
$('copy-key').onclick = () => copy(false); $('copy-details').onclick = () => copy(true); setInterval(update, 1000); document.addEventListener('visibilitychange', () => { if (document.hidden) clearCopy(); else update(); }); update();
