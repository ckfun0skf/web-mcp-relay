const $ = id => document.getElementById(id);
async function save(enabled) { const r = await chrome.runtime.sendMessage({ type: 'hint-config', enabled }); if (!r?.ok) throw new Error(r?.error || 'Background unavailable.'); $('enabled').checked = enabled; }
async function run(task) { try { await task(); } catch (error) { $('status').textContent = error.message; } }
chrome.storage.local.get('showWebMCPHints').then(s => { $('enabled').checked = s.showWebMCPHints !== false; }).catch(e => { $('status').textContent = e.message; });
$('save').onclick = () => run(async () => { await save($('enabled').checked); $('status').textContent = 'Preference saved. Existing hints close on their next check.'; });
function grant(origins) {
  const request = chrome.permissions.request({ origins });
  run(async () => { if (!(await request)) throw new Error('Website access was not granted.'); await save(true); $('status').textContent = 'Automatic hints enabled on permitted sites. Open a WebMCP page; detection may take up to ten seconds.'; });
}
$('grant-site').onclick = () => { try { const u = new URL($('site').value.trim()); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw new Error('Enter an HTTP(S) origin without paths or credentials.'); grant([u.origin + '/*']); } catch (e) { $('status').textContent = e.message; } };
$('grant-all').onclick = () => { if (confirm('Allow automatic read-only WebMCP discovery on all HTTP(S) websites? This is optional and can be revoked in Chrome.')) grant(['https://*/*', 'http://*/*']); };
