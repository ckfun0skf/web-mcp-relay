const sessions = new Map();
const appURL = chrome.runtime.getURL('app.html');
const dockURL = chrome.runtime.getURL('dock.html');
chrome.action.onClicked.addListener(async tab => {
  if (!tab.id || !/^https?:\/\//.test(tab.url || '')) return;
  const old = sessions.get(tab.id);
  if (old) { try { await chrome.windows.update(old.windowId, { state: 'normal', focused: true }); return; } catch { sessions.delete(tab.id); } }
  await chrome.windows.create({ url: appURL + '?tab=' + tab.id, type: 'popup', width: 600, height: 800 });
});
chrome.runtime.onMessage.addListener((m, sender, respond) => {
  (async () => {
    const isApp = sender.url?.split('?')[0] === appURL && (!sender.tab || sender.tab.url?.startsWith(appURL));
    const isDock = sender.url?.split('?')[0] === dockURL;
    if (!isApp && !isDock) throw new Error('Unsupported view');
    const tabId = isApp ? Number(m.tabId) : sender.tab?.id;
    if (!Number.isSafeInteger(tabId)) throw new Error('No target tab');
    if (m.type === 'register' && isApp) {
      const view = await chrome.windows.get(m.windowId, { populate: true });
      if (!view.tabs?.some(t => t.url?.startsWith(appURL))) throw new Error('Invalid control window');
      const previous = sessions.get(tabId);
      if (previous && previous.windowId !== m.windowId) throw new Error('Another controller already owns this tab');
      sessions.set(tabId, { windowId: m.windowId, state: m.state });
      return { ok: true };
    }
    const session = sessions.get(tabId);
    if (!session) return { ok: false, error: 'Controller unavailable. Click the extension toolbar again.' };
    if (isApp && m.windowId !== session.windowId) throw new Error('Wrong controller');
    if (m.type === 'state') return { ok: true, state: session.state };
    if (m.type === 'open') { await chrome.windows.update(session.windowId, { state: 'normal', focused: true }); return { ok: true }; }
    if (m.type === 'layout' && ['left', 'right', 'bottom', 'window'].includes(m.mode)) {
      await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: 'ISOLATED', func: mountDock, args: [m.mode, dockURL] });
      if (m.mode === 'window') await chrome.windows.update(session.windowId, { state: 'normal', focused: true });
      else await chrome.windows.update(session.windowId, { state: 'minimized' });
      await chrome.storage.local.set({ preferredDock: m.mode });
      return { ok: true };
    }
    throw new Error('Unsupported command');
  })().then(respond, error => respond({ ok: false, error: String(error.message || error) }));
  return true;
});
chrome.windows.onRemoved.addListener(windowId => {
  for (const [tabId, session] of sessions) if (session.windowId === windowId) {
    sessions.delete(tabId);
    chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: 'ISOLATED', func: mountDock, args: ['window', dockURL] }).catch(() => {});
  }
});
chrome.tabs.onRemoved.addListener(tabId => sessions.delete(tabId));
function mountDock(mode, url) {
  const key = '__webMcpRelayDockV2';
  const old = globalThis[key];
  if (old) {
    old.host.remove();
    for (const [property, value, priority] of old.styles) { if (value) document.documentElement.style.setProperty(property, value, priority); else document.documentElement.style.removeProperty(property); }
    delete globalThis[key];
  }
  if (mode === 'window') return;
  const root = document.documentElement;
  const property = mode === 'bottom' ? 'padding-bottom' : 'padding-' + mode;
  const styles = [property, 'box-sizing'].map(p => [p, root.style.getPropertyValue(p), root.style.getPropertyPriority(p)]);
  const size = mode === 'bottom' ? 'min(340px, 45vh)' : 'min(360px, 45vw)';
  root.style.setProperty(property, size, 'important'); root.style.setProperty('box-sizing', 'border-box', 'important');
  const host = document.createElement('div');
  host.style.cssText = 'all:initial!important;position:fixed!important;z-index:2147483647!important;display:block!important;' + (mode === 'bottom' ? 'bottom:0!important;left:0!important;width:100vw!important;height:' + size + '!important;' : 'top:0!important;' + mode + ':0!important;height:100vh!important;width:' + size + '!important;');
  const shadow = host.attachShadow({ mode: 'closed' });
  const frame = document.createElement('iframe'); frame.src = url; frame.title = 'Web MCP Relay dock'; frame.style.cssText = 'border:0;width:100%;height:100%;display:block;color-scheme:dark';
  shadow.append(frame); root.append(host); globalThis[key] = { host, styles };
}
