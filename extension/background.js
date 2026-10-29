chrome.action.onClicked.addListener(async tab => {
  if (!tab.id || !/^https?:\/\//.test(tab.url || '')) return;
  const url = chrome.runtime.getURL('app.html') + '?tab=' + tab.id;
  const windows = await chrome.windows.getAll({ populate: true });
  const existing = windows.find(w => w.tabs?.some(t => t.url === url));
  if (existing) { await chrome.windows.update(existing.id, { state: 'normal', focused: true }); return; }
  await chrome.windows.create({ url, type: 'popup', width: 600, height: 800 });
});
