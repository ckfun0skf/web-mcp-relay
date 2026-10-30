const $ = id => document.getElementById(id);
const sessionId = new URLSearchParams(location.search).get('session');
let current, polling = false;
function clearSession() { current = null; $('key').value = ''; $('mcp').value = ''; $('copy-key').disabled = true; $('copy-details').disabled = true; }
async function update() {
  if (polling) return; polling = true;
  try {
    const r = await chrome.runtime.sendMessage({ type: 'session-handoff', sessionId }); if (!r?.ok) throw new Error(r?.error || 'Background unavailable.');
    const s = r.value; $('status').textContent = s.status; $('target').textContent = s.origin || ''; $('expiry').textContent = s.ended ? '' : 'No automatic expiry · End session in the toolbar popup';
    if (s.ended || !s.connected) { clearSession(); return; }
    current = s; $('key').value = s.key; $('mcp').value = s.mcp; $('copy-key').disabled = false; $('copy-details').disabled = false;
  } catch (error) { clearSession(); $('status').textContent = error.message; }
  finally { polling = false; }
}
function copy(details) {
  if (!current?.key) { clearSession(); $('feedback').textContent = 'Session unavailable. Connect again using the extension popup.'; return; }
  const text = details ? 'Web MCP Relay connector\nMCP server URL: ' + current.mcp + '\nAuthentication: None (this MVP uses session_key in tool arguments).\nSession key: ' + current.key + '\nSession expiry: None. End the session explicitly when finished. Browser or network interruption can still disconnect it.\nAfter configuring the remote MCP connector, call list_browser_tools with ' + JSON.stringify({ session_key: current.key }) + '. Then use the returned tool_id and snapshot with call_browser_tool. Do not automatically retry writes with unknown outcomes.' : current.key;
  navigator.clipboard.writeText(text).then(() => { $('feedback').textContent = details ? 'Session and connector details copied. Paste only into your trusted AI agent.' : 'Session key copied.'; }, () => { $('feedback').textContent = 'Clipboard unavailable. Select the field and copy manually.'; });
}
$('copy-key').onclick = () => copy(false); $('copy-details').onclick = () => copy(true);
setInterval(update, 1000); document.addEventListener('visibilitychange', () => { if (document.hidden) clearSession(); else update(); }); update();
