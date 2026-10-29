import { initialized, loadSecret, forgetSecret } from './app.js';
const $ = id => document.getElementById(id);
let step = 1;
const titles = ['Prepare', 'Connect', 'Ready'];
function notice(text) { $('notice').textContent = text; }
function show(value) {
  step = Math.max(1, Math.min(3, value));
  document.querySelectorAll('[data-step]').forEach(el => { el.hidden = Number(el.dataset.step) !== step; });
  $('back').disabled = step === 1; $('next').textContent = step === 3 ? 'Ready ✓' : 'Next →';
  $('step-label').textContent = step + ' / 3 · ' + titles[step - 1];
  $('progress').replaceChildren(...titles.map((title, i) => { const el = document.createElement('span'); el.title = title; el.className = i < step ? 'active' : ''; return el; }));
}
$('back').onclick = () => show(step - 1);
$('next').onclick = () => { if (step === 2 && !$('session').value) { notice('Select Verify & connect first. The Connection card shows the exact result.'); return; } if (step === 3) { notice('Ready. Keep this window open while using browser tools.'); return; } show(step + 1); };
$('existing').onclick = () => show(2); $('edit-secret').onclick = () => show(1);
function generate() { $('owner').value = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''); }
$('generate').onclick = () => { if ($('owner').value && !confirm('Replace the current secret? Update OWNER_SECRET in Cloudflare to match.')) return; generate(); notice('New secret generated. Update Cloudflare before connecting.'); };
async function copy(id) { if (!$(id).value) throw new Error('The field is empty.'); await navigator.clipboard.writeText($(id).value); }
function copyButton(id) { return async () => { try { await copy(id); notice('Copied. Never share secrets publicly.'); } catch (error) { $(id).focus(); $(id).select(); notice('Copy manually: ' + error.message); } }; }
$('copy-owner').onclick = copyButton('owner'); $('copy-mcp').onclick = copyButton('mcp');
$('show-owner').onclick = () => { const visible = $('owner').type === 'password'; $('owner').type = visible ? 'text' : 'password'; $('show-owner').textContent = visible ? 'Hide' : 'Show'; $('show-owner').setAttribute('aria-pressed', String(visible)); };
$('deploy').onclick = async () => {
  try {
    if (!/^[A-Za-z0-9_-]{32,256}$/.test($('owner').value)) throw new Error('Prepare a valid OWNER_SECRET before deploying.');
    await copy('owner');
    const url = new URL('https://deploy.workers.cloudflare.com/'); url.searchParams.set('url', 'https://github.com/ckfun0skf/web-mcp-relay');
    await chrome.windows.create({ url: url.href, type: 'popup', width: 1000, height: 800 });
    $('deploy-guide').hidden = false; notice('Secret copied. Complete deployment in Cloudflare, then return here.');
  } catch (error) { $('deploy-guide').hidden = false; notice('Deployment window not opened: ' + error.message + ' Copy the secret manually and try again.'); }
};
$('relay').addEventListener('change', () => loadSecret().catch(error => notice(error.message)));
$('forget').onclick = async () => { if (!confirm('Disconnect and forget the saved secret for this relay on this device?')) return; try { await forgetSecret(); notice('Saved secret removed. Cloudflare itself was not changed.'); } catch (error) { notice(error.message); } };
window.addEventListener('relay-state', event => { $('badge').textContent = event.detail.connected ? 'CONNECTED' : 'OFFLINE'; $('handoff').hidden = !event.detail.connected; $('connect').disabled = event.detail.connected || event.detail.connecting; if (event.detail.connected) show(3); });
new MutationObserver(async () => { if ($('approval').hidden) return; try { const view = await chrome.windows.getCurrent(); await chrome.windows.update(view.id, { state: 'normal', focused: true }); $('approval').focus(); } catch {} }).observe($('approval'), { attributes: true, attributeFilter: ['hidden'] });
initialized.then(() => { if (!$('owner').value) generate(); show($('relay').value ? 2 : 1); }).catch(error => notice(error.message));
