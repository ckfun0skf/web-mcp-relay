import './app.js';
const $ = id => document.getElementById(id);
const tabId = Number(new URL(location.href).searchParams.get('tab'));
const deployURL = 'https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fckfun0skf%2Fweb-mcp-relay%2Ftree%2Fmain%2Frelay';
let step = 1, verified = '', ownWindow, saving, announced = false;
const titles = ['Deploy', 'Secret', 'Verify', 'Connect', 'ChatGPT'];
function notice(text) { $('notice').textContent = text; }
async function send(type, extra = {}) { const r = await chrome.runtime.sendMessage({ type, tabId, windowId: ownWindow, ...extra }); if (!r?.ok) throw new Error(r?.error || 'Extension service unavailable'); return r; }
function show(value) {
  step = Math.min(5, Math.max(1, value));
  document.querySelectorAll('[data-step]').forEach(el => { el.hidden = Number(el.dataset.step) !== step; });
  $('back').disabled = step === 1; $('next').textContent = step === 5 ? 'Finish setup ✓' : 'Next →';
  $('step-label').textContent = step + ' / 5 · ' + titles[step - 1];
  $('progress').replaceChildren(...titles.map((title, i) => { const el = document.createElement('span'); el.className = i < step ? 'active' : ''; el.title = title; return el; }));
  chrome.storage.local.set({ setupStep: Math.min(step, 3) });
}
$('back').onclick = () => show(step - 1);
$('next').onclick = async () => {
  if (step === 2 && (!$('configured').checked || !/^[A-Za-z0-9_-]{32,256}$/.test($('owner').value))) { notice('Enter a valid secret and confirm that Cloudflare uses the same value.'); return; }
  if (step === 3 && verified !== $('relay').value.trim()) { notice('Test the currently entered relay URL before continuing.'); return; }
  if (step === 4 && !$('session').value) { notice('Establish a WebSocket connection before continuing.'); return; }
  if (step === 5) { if (!$('session').value) { show(4); notice('The connection has closed. Please reconnect.'); return; } await chrome.storage.local.set({ setupComplete: true }); notice('Setup complete. Use the Dock controls above to choose a layout.'); return; }
  show(step + 1);
};
$('existing').onclick = () => show(2);
$('edit-secret').onclick = () => show(2);
$('deploy').onclick = async () => { try { await chrome.windows.create({ url: deployURL, type: 'popup', width: 1000, height: 800 }); notice('Cloudflare opened in a separate window. Generate your secret here, then select Next when ready.'); } catch { notice('Could not open the deployment window. Please try again.'); } };
$('generate').onclick = () => { if ($('owner').value && !confirm('Generate a new secret? You must also update OWNER_SECRET in Cloudflare.')) return; $('owner').value = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''); $('configured').checked = false; notice('Secret generated. Copy it into your Cloudflare secret settings before continuing.'); };
async function copy(id) { try { if (!$(id).value) throw new Error(); await navigator.clipboard.writeText($(id).value); notice('Copied. Never share secrets publicly.'); } catch { $(id).focus(); $(id).select(); notice('Automatic copy failed. Copy the selected field manually.'); } }
$('copy-owner').onclick = () => copy('owner'); $('copy-mcp').onclick = () => copy('mcp');
$('show-owner').onclick = () => { const visible = $('owner').type === 'password'; $('owner').type = visible ? 'text' : 'password'; $('show-owner').textContent = visible ? 'Hide' : 'Show'; $('show-owner').setAttribute('aria-pressed', String(visible)); };
$('relay').addEventListener('input', () => { verified = ''; $('health-status').textContent = 'URL changed. Test the service again.'; clearTimeout(saving); saving = setTimeout(() => chrome.storage.local.set({ relay: $('relay').value.trim() }), 500); });
$('health').onclick = async () => {
  $('health').disabled = true;
  try {
    const url = new URL($('relay').value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Enter an HTTPS base URL without /mcp, query parameters or credentials.');
    const granted = await chrome.permissions.request({ origins: [url.origin + '/*'] });
    if (!granted) throw new Error('Permission to access this relay was not granted.');
    $('health-status').textContent = 'Checking service compatibility…';
    const response = await fetch(url.origin + '/health', { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Health check returned HTTP ' + response.status);
    const data = await response.json();
    if (data.protocolVersion !== 1 || data.name !== 'web-mcp-relay') throw new Error('This is not a compatible web-mcp-relay service. Check the deployed repository and version.');
    verified = $('relay').value.trim(); $('health-status').textContent = '✓ Compatible service. The next step validates your secret and WebSocket connection.';
  } catch (error) { verified = ''; $('health-status').textContent = 'Check failed: ' + (error.name === 'TimeoutError' ? 'No response within 8 seconds. Check your deployment status.' : error.message); }
  finally { $('health').disabled = false; }
};
$('connect').addEventListener('click', event => { if (!$('owner').value) { event.preventDefault(); event.stopImmediatePropagation(); show(2); notice('Secrets are not stored permanently. Enter OWNER_SECRET again to reconnect.'); } }, true);
document.querySelectorAll('[data-mode]').forEach(button => button.onclick = async () => { try { await report(); await send('layout', { mode: button.dataset.mode }); notice(button.dataset.mode === 'window' ? 'Returned to the separate window.' : 'Panel docked. The control window is minimized; do not close it.'); } catch (error) { notice('Docking failed. Keep using the separate window: ' + error.message); } });
async function report() { if (!ownWindow) return; await send('register', { state: { connected: Boolean($('session').value), step, target: $('target').textContent.slice(0, 240) } }); }
const observer = new MutationObserver(async () => { if ($('approval').hidden || announced) return; announced = true; try { await chrome.windows.update(ownWindow, { state: 'normal', focused: true }); $('approval').focus(); } catch {} });
observer.observe($('approval'), { attributes: true, attributeFilter: ['hidden'] });
setInterval(() => { const connected = Boolean($('session').value); $('badge').textContent = connected ? 'CONNECTED' : 'OFFLINE'; $('handoff').hidden = !connected; $('connect').disabled = connected; if ($('approval').hidden) announced = false; report().catch(() => {}); }, 2000);
(async () => { ownWindow = (await chrome.windows.getCurrent()).id; const saved = await chrome.storage.local.get(['setupStep', 'setupComplete']); show(saved.setupComplete ? 4 : saved.setupStep || 1); await report(); })().catch(error => notice(error.message));
