chrome.action.onClicked.addListener(async tab => {
  if (!tab.id || !/^https?:\/\//.test(tab.url || '')) return;
  await chrome.windows.create({ url: chrome.runtime.getURL('app.html') + '?tab=' + tab.id, type: 'popup', width: 640, height: 800 });
});
