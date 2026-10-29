const expected = new URLSearchParams(location.search).get('scope');
const buttons = [...document.querySelectorAll('button')];
async function rpc(type, extra = {}) { const r = await chrome.runtime.sendMessage({ type, ...extra }); if (!r?.ok) throw new Error(r?.error || 'Background unavailable.'); return r.value; }
async function check() { const s = await rpc('policy-state'); document.getElementById('origin').textContent = s.origin || ''; if (s.scopeId !== expected) { buttons.forEach(b => b.disabled = true); throw new Error('Page/session changed. Reopen Agent permissions.'); } }
buttons.forEach(button => { button.onclick = async () => { buttons.forEach(b => b.disabled = true); try { await check(); await rpc('policy-choose', { mode: button.id, scopeId: expected }); window.close(); } catch (e) { document.getElementById('status').textContent = e.message; } }; });
check().catch(e => { document.getElementById('status').textContent = e.message; });
