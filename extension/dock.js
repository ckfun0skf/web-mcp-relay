async function command(type, extra = {}) { const result = await chrome.runtime.sendMessage({ type, ...extra }); if (!result?.ok) throw new Error(result?.error || 'Control window is not ready'); return result; }
async function refresh() { try { const { state } = await command('state'); document.getElementById('state').textContent = (state.connected ? '● Connected' : '○ Disconnected') + ' · Setup step ' + state.step + '/5'; document.getElementById('target').textContent = state.target; } catch (error) { document.getElementById('state').textContent = error.message; } }
document.getElementById('open').onclick = () => command('open').catch(error => { document.getElementById('state').textContent = error.message; });
document.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => command('layout', { mode: button.dataset.mode }).catch(error => { document.getElementById('state').textContent = error.message; }));
refresh(); setInterval(refresh, 2500);
