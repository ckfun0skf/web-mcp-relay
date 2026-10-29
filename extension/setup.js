import './app.js';
const $ = id => document.getElementById(id);
const tabId = Number(new URL(location.href).searchParams.get('tab'));
const deployURL = 'https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fckfun0skf%2Fweb-mcp-relay%2Ftree%2Fmain%2Frelay';
let step = 1, verified = '', ownWindow, saving, announced = false;
const titles = ['部署', '安全金鑰', '測試服務', '連接網站', 'ChatGPT'];
function notice(text) { $('notice').textContent = text; }
async function send(type, extra = {}) { const r = await chrome.runtime.sendMessage({ type, tabId, windowId: ownWindow, ...extra }); if (!r?.ok) throw new Error(r?.error || 'Extension service unavailable'); return r; }
function show(value) {
  step = Math.min(5, Math.max(1, value));
  document.querySelectorAll('[data-step]').forEach(el => { el.hidden = Number(el.dataset.step) !== step; });
  $('back').disabled = step === 1; $('next').textContent = step === 5 ? '完成設定 ✓' : 'Next →';
  $('step-label').textContent = step + ' / 5 · ' + titles[step - 1];
  $('progress').replaceChildren(...titles.map((title, i) => { const el = document.createElement('span'); el.className = i < step ? 'active' : ''; el.title = title; return el; }));
  chrome.storage.local.set({ setupStep: Math.min(step, 3) });
}
$('back').onclick = () => show(step - 1);
$('next').onclick = async () => {
  if (step === 2 && (!$('configured').checked || !/^[A-Za-z0-9_-]{32,256}$/.test($('owner').value))) { notice('請填入有效金鑰，並確認 Cloudflare 已設定同一值。'); return; }
  if (step === 3 && verified !== $('relay').value.trim()) { notice('請先測試目前填寫的 relay URL。'); return; }
  if (step === 4 && !$('session').value) { notice('請先成功建立 WebSocket 連線，再繼續。'); return; }
  if (step === 5) { if (!$('session').value) { show(4); notice('連線已中斷，請重新連接。'); return; } await chrome.storage.local.set({ setupComplete: true }); notice('設定完成。可以用上方 Dock 按鈕切換顯示模式。'); return; }
  show(step + 1);
};
$('existing').onclick = () => show(2);
$('edit-secret').onclick = () => show(2);
$('deploy').onclick = async () => { try { await chrome.windows.create({ url: deployURL, type: 'popup', width: 1000, height: 800 }); notice('Cloudflare 已另開。請在此繼續產生金鑰；完成後按 Next。'); } catch { notice('無法開啟部署視窗，請重試。'); } };
$('generate').onclick = () => { if ($('owner').value && !confirm('產生新金鑰？你亦需要更新 Cloudflare 的 OWNER_SECRET。')) return; $('owner').value = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''); $('configured').checked = false; notice('金鑰已產生；複製到 Cloudflare Secret 後再繼續。'); };
async function copy(id) { try { if (!$(id).value) throw new Error(); await navigator.clipboard.writeText($(id).value); notice('已複製。秘密資料唔好公開分享。'); } catch { $(id).focus(); $(id).select(); notice('無法自動複製，請在欄位手動複製。'); } }
$('copy-owner').onclick = () => copy('owner'); $('copy-mcp').onclick = () => copy('mcp');
$('show-owner').onclick = () => { const visible = $('owner').type === 'password'; $('owner').type = visible ? 'text' : 'password'; $('show-owner').textContent = visible ? '隱藏' : '顯示'; $('show-owner').setAttribute('aria-pressed', String(visible)); };
$('relay').addEventListener('input', () => { verified = ''; $('health-status').textContent = 'URL 已更改，請重新測試。'; clearTimeout(saving); saving = setTimeout(() => chrome.storage.local.set({ relay: $('relay').value.trim() }), 500); });
$('health').onclick = async () => {
  $('health').disabled = true;
  try {
    const url = new URL($('relay').value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('請輸入 HTTPS base URL，唔好包含 /mcp、query 或帳密。');
    const granted = await chrome.permissions.request({ origins: [url.origin + '/*'] });
    if (!granted) throw new Error('未授權連接此 relay。');
    $('health-status').textContent = '檢查服務版本…';
    const response = await fetch(url.origin + '/health', { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('健康檢查 HTTP ' + response.status);
    const data = await response.json();
    if (data.protocolVersion !== 1 || data.name !== 'web-mcp-relay') throw new Error('唔係相容的 web-mcp-relay 服務；請檢查部署 repo／版本。');
    verified = $('relay').value.trim(); $('health-status').textContent = '✓ 服務相容。下一步驗證金鑰及 WebSocket。';
  } catch (error) { verified = ''; $('health-status').textContent = '未通過：' + (error.name === 'TimeoutError' ? '8 秒內未回應，請檢查部署狀態。' : error.message); }
  finally { $('health').disabled = false; }
};
$('connect').addEventListener('click', event => { if (!$('owner').value) { event.preventDefault(); event.stopImmediatePropagation(); show(2); notice('為安全起見金鑰唔會永久保存，請重新輸入 OWNER_SECRET。'); } }, true);
document.querySelectorAll('[data-mode]').forEach(button => button.onclick = async () => { try { await report(); await send('layout', { mode: button.dataset.mode }); notice(button.dataset.mode === 'window' ? '已返回獨立視窗。' : '已停靠。控制視窗只會最小化，請勿關閉。'); } catch (error) { notice('無法停靠，保留獨立視窗：' + error.message); } });
async function report() { if (!ownWindow) return; await send('register', { state: { connected: Boolean($('session').value), step, target: $('target').textContent.slice(0, 240) } }); }
const observer = new MutationObserver(async () => { if ($('approval').hidden || announced) return; announced = true; try { await chrome.windows.update(ownWindow, { state: 'normal', focused: true }); $('approval').focus(); } catch {} });
observer.observe($('approval'), { attributes: true, attributeFilter: ['hidden'] });
setInterval(() => { const connected = Boolean($('session').value); $('badge').textContent = connected ? 'CONNECTED' : 'OFFLINE'; $('handoff').hidden = !connected; $('connect').disabled = connected; if ($('approval').hidden) announced = false; report().catch(() => {}); }, 2000);
(async () => { ownWindow = (await chrome.windows.getCurrent()).id; const saved = await chrome.storage.local.get(['setupStep', 'setupComplete']); show(saved.setupComplete ? 4 : saved.setupStep || 1); await report(); })().catch(error => notice(error.message));
