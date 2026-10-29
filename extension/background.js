chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html') || message?.type !== 'open-controller') return;
  (async () => {
    if (!Number.isSafeInteger(message.tabId) || typeof message.documentId !== 'string') throw new Error('Select and inspect a supported browser tab first.');
    const tab = await chrome.tabs.get(message.tabId);
    if (!/^https?:\/\//.test(tab.url || '')) throw new Error('This page cannot be used as a tool target.');
    const frame = (await chrome.scripting.executeScript({ target: { tabId: message.tabId, documentIds: [message.documentId] }, func: () => location.origin, world: 'MAIN' }))[0];
    if (!frame || frame.documentId !== message.documentId || frame.result !== message.origin) throw new Error('The page changed. Refresh discovery before opening setup.');
    const url = chrome.runtime.getURL('app.html') + '?tab=' + message.tabId;
    const windows = await chrome.windows.getAll({ populate: true });
    const existing = windows.find(w => w.tabs?.some(t => t.url === url));
    if (existing) await chrome.windows.update(existing.id, { state: 'normal', focused: true });
    else await chrome.windows.create({ url, type: 'popup', width: 600, height: 800 });
    return { ok: true };
  })().then(respond, error => respond({ ok: false, error: String(error.message || error) }));
  return true;
});
