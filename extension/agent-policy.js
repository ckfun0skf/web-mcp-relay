let scope = null, mode = 'ask', needsChoice = false, revision = 0;
const tools = new Set();
let writes = Promise.resolve();
const ui = sender => sender.id === chrome.runtime.id && ['popup.html', 'trust.html', 'hint-options.html'].some(p => sender.url?.split('?')[0] === chrome.runtime.getURL(p));
async function saved() { return (await chrome.storage.local.get('trustedWebsites')).trustedWebsites || {}; }
function clear() { scope = null; mode = 'ask'; needsChoice = false; tools.clear(); revision++; }
async function bind(value) {
  clear(); const next = { ...value, id: crypto.randomUUID() }; scope = next; needsChoice = true;
  const sites = await saved(); if (scope !== next) return;
  if (sites[next.origin]) { mode = 'website'; needsChoice = false; }
}
function summary() { return { scopeId: scope?.id, origin: scope?.origin, mode, needsChoice, revision, trusted: !needsChoice && mode !== 'ask', allowedToolCount: tools.size }; }
function invalidate() { mode = 'ask'; needsChoice = false; tools.clear(); revision++; }
async function choose(selected, id) {
  if (!scope || scope.id !== id || !['ask', 'session', 'website'].includes(selected)) throw new Error('Page/session changed. Open permissions again.');
  const current = scope;
  if (selected === 'website') {
    writes = writes.catch(() => {}).then(async () => { if (scope !== current) throw new Error('Page changed.'); const sites = await saved(); sites[current.origin] = { createdAt: Date.now() }; await chrome.storage.local.set({ trustedWebsites: sites }); });
    await writes;
  }
  if (scope !== current) throw new Error('Page changed.');
  mode = selected; needsChoice = false; tools.clear(); revision++; return summary();
}
async function allowed(toolKey) {
  const current = scope; const at = revision;
  if (!current || needsChoice) return { allowed: false, needsChoice, revision: at };
  const website = mode === 'website' && Boolean((await saved())[current.origin]);
  return { allowed: scope === current && revision === at && (mode === 'session' || website || tools.has(toolKey)), revision: at };
}
function grantTool(toolKey, id) { if (!scope || scope.id !== id || needsChoice) throw new Error('Permission scope changed.'); tools.add(toolKey); revision++; }
async function open() { if (!scope) throw new Error('Connect a page first.'); await chrome.windows.create({ url: chrome.runtime.getURL('trust.html') + '?scope=' + encodeURIComponent(scope.id), type: 'popup', width: 500, height: 450, focused: true }); }
chrome.runtime.onMessage.addListener((m, sender, respond) => {
  if (!m?.type?.startsWith('policy-') || !ui(sender)) return;
  (async () => {
    if (m.type === 'policy-state') return summary();
    if (m.type === 'policy-open') { await open(); return summary(); }
    if (m.type === 'policy-choose') { if (sender.url?.split('?')[0] !== chrome.runtime.getURL('trust.html')) throw new Error('Trust dialog required.'); return choose(m.mode, m.scopeId); }
    if (m.type === 'policy-list') return Object.keys(await saved()).sort();
    if (m.type === 'policy-revoke') {
      if (sender.url?.split('?')[0] !== chrome.runtime.getURL('hint-options.html')) throw new Error('Options required.');
      if (scope?.origin === m.origin) invalidate();
      writes = writes.catch(() => {}).then(async () => { const sites = await saved(); delete sites[m.origin]; await chrome.storage.local.set({ trustedWebsites: sites }); }); await writes; return Object.keys(await saved()).sort();
    }
    throw new Error('Unsupported policy command.');
  })().then(value => respond({ ok: true, value }), e => respond({ ok: false, error: e.message })); return true;
});
export const policy = { clear, bind, summary, choose, allowed, grantTool, open, invalidate };
