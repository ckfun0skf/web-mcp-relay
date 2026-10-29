import { ready, view, connect } from './background.js';
import { inspectTab } from './native.js';
const registration = 'webmcp-connection-hint';
let syncQueue = Promise.resolve();
function syncHints(inject = false) {
  syncQueue = syncQueue.catch(() => {}).then(async () => {
    await ready; const settings = await chrome.storage.local.get('showWebMCPHints');
    const origins = (await chrome.permissions.getAll()).origins || [];
    const matches = origins.filter(p => /^https?:\/\//.test(p));
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [registration] });
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [registration] });
    if (settings.showWebMCPHints === false || !matches.length) return;
    await chrome.scripting.registerContentScripts([{ id: registration, matches, js: ['hint-content.js'], runAt: 'document_idle', allFrames: false, persistAcrossSessions: true }]);
    if (inject) for (const tab of await chrome.tabs.query({ url: matches })) { if (tab.id) chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, files: ['hint-content.js'] }).catch(() => {}); }
  }); return syncQueue;
}
chrome.permissions.onAdded.addListener(() => { syncHints(true).catch(() => {}); });
chrome.permissions.onRemoved.addListener(() => { syncHints().catch(() => {}); });
chrome.runtime.onInstalled.addListener(() => { syncHints(true).catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { syncHints(true).catch(() => {}); });
syncHints().catch(() => {});
const cache = new Map();
chrome.tabs.onRemoved.addListener(id => cache.delete(id));
chrome.runtime.onMessage.addListener((m, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !['hint-read', 'hint-connect', 'hint-config'].includes(m?.type)) return;
  (async () => {
    await ready;
    if (m.type === 'hint-config') {
      if (sender.tab || sender.url !== chrome.runtime.getURL('hint-options.html')) throw new Error('Options page required.');
      await chrome.storage.local.set({ showWebMCPHints: m.enabled === true }); cache.clear(); await syncHints(true); return { saved: true };
    }
    if (!sender.tab?.id || sender.frameId !== 0 || !sender.documentId || !/^https?:\/\//.test(sender.url || '')) throw new Error('Top-document content script required.');
    const tab = await chrome.tabs.get(sender.tab.id);
    if (!tab.active) return { hidden: true };
    const origin = new URL(sender.url).origin;
    const prefs = await chrome.storage.local.get('showWebMCPHints');
    if (prefs.showWebMCPHints === false || !(await chrome.permissions.contains({ origins: [origin + '/*'] }))) return { hidden: true };
    const s = await view();
    const same = s.connected && s.session?.tabId === tab.id && s.session?.origin === origin && s.documentId === sender.documentId;
    if (same) return { connected: true };
    const old = cache.get(tab.id);
    const listing = m.type === 'hint-read' && old?.documentId === sender.documentId && Date.now() - old.time < 5000 ? old.listing : await inspectTab(tab.id, sender.documentId);
    cache.set(tab.id, { documentId: sender.documentId, time: Date.now(), listing });
    if (listing.origin !== origin) throw new Error('Page changed.');
    if (m.type === 'hint-read') return { available: listing.available, executable: listing.executable, tools: listing.tools, connecting: s.connecting, status: s.status };
    if (!listing.available || !listing.executable || !listing.tools.length) throw new Error('Tools are not ready.');
    if (s.connecting) return { message: 'A connection is already in progress.' };
    const relayAllowed = s.relay && await chrome.permissions.contains({ origins: [s.relay + '/*'] });
    if (!s.setupComplete || !s.hasSecret || !relayAllowed) {
      try { await chrome.action.openPopup({ windowId: tab.windowId }); } catch {}
      return { message: 'Complete relay settings or grant relay access using the extension toolbar popup, then connect this page.' };
    }
    if (s.transportConnected && s.session && (s.session.tabId !== tab.id || s.session.origin !== origin) && m.replace !== true) return { confirmReplace: true, message: 'Another page is connected. Click Connect Now again to replace that session.' };
    await connect({ relay: s.relay, owner: '', tabId: tab.id, documentId: sender.documentId });
    const after = await view(); return { message: after.status, connecting: after.connecting };
  })().then(value => respond({ ok: true, value }), error => respond({ ok: false, error: String(error.message || error).slice(0, 500) })); return true;
});
