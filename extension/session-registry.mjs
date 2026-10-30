const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
export class SessionRegistry {
  #items = new Map();
  constructor({ id = () => crypto.randomUUID(), key = token, now = Date.now } = {}) { this.id = id; this.key = key; this.now = now; }
  #get(id) { const s = this.#items.get(id); if (!s || s.status === 'ended') throw new Error('Session ended or not found.'); return s; }
  create({ tabId, documentId, origin, name = '' }) {
    const url = new URL(origin);
    if (!['https:', 'http:'].includes(url.protocol) || url.origin !== origin || !Number.isInteger(tabId) || tabId < 0 || typeof documentId !== 'string' || !documentId) throw new Error('Invalid document target.');
    const id = this.id(), key = this.key();
    if (this.#items.has(id) || !/^[a-f0-9]{64}$/.test(key) || [...this.#items.values()].some(s => s.key === key)) throw new Error('Session identity collision.');
    this.#items.set(id, { id, key, tabId, documentId, origin, name: String(name).trim().slice(0, 80) || 'Agent ' + (this.#items.size + 1), status: 'connecting', paused: false, mode: 'ask', tools: new Set(), revision: 0, createdAt: this.now() });
    return this.get(id);
  }
  #public(s) { const { key, tools, ...visible } = s; return { ...visible, allowedToolCount: tools.size }; }
  get(id) { return this.#public(this.#get(id)); }
  list({ tabId } = {}) { return [...this.#items.values()].filter(s => s.status !== 'ended' && (tabId === undefined || s.tabId === tabId)).map(s => this.#public(s)); }
  capability(id) { return this.#get(id).key; }
  rename(id, name) { const value = String(name).trim().slice(0, 80); if (!value) throw new Error('Name required.'); this.#get(id).name = value; return this.get(id); }
  transport(id, status) { if (!['connecting', 'connected', 'disconnected'].includes(status)) throw new Error('Invalid transport state.'); const s = this.#get(id); s.status = status; if (status !== 'connected') this.#reset(s); return this.get(id); }
  #reset(s) { s.mode = 'ask'; s.tools.clear(); s.revision++; }
  pause(id, paused) { const s = this.#get(id); s.paused = Boolean(paused); this.#reset(s); return this.get(id); }
  trust(id, mode) { const s = this.#get(id); if (!['ask', 'session'].includes(mode) || s.paused) throw new Error('Invalid permission change.'); this.#reset(s); s.mode = mode; return this.get(id); }
  allowTool(id, fingerprint) { const s = this.#get(id); if (s.paused || typeof fingerprint !== 'string' || !fingerprint) throw new Error('Invalid tool grant.'); s.tools.add(fingerprint); s.revision++; }
  stamp(id) { const s = this.#get(id); return { sessionId: id, tabId: s.tabId, documentId: s.documentId, revision: s.revision }; }
  canExecute(stamp, fingerprint, { allowOnce = false } = {}) { const s = this.#items.get(stamp.sessionId); return Boolean(s && s.status === 'connected' && !s.paused && s.documentId && s.documentId === stamp.documentId && s.tabId === stamp.tabId && s.revision === stamp.revision && (allowOnce || s.mode === 'session' || s.tools.has(fingerprint))); }
  invalidateTab(tabId) { for (const s of this.#items.values()) if (s.tabId === tabId && s.status !== 'ended') { s.documentId = null; this.#reset(s); } }
  rebindTab(tabId, documentId, origin) { if (typeof documentId !== 'string' || !documentId) throw new Error('Document required.'); for (const s of this.#items.values()) if (s.tabId === tabId && s.status !== 'ended') { if (s.origin !== origin) this.end(s.id); else { s.documentId = documentId; this.#reset(s); } } }
  end(id) { const s = this.#get(id); this.#reset(s); s.status = 'ended'; s.key = null; s.documentId = null; }
  endTab(tabId) { for (const s of this.list({ tabId })) this.end(s.id); }
}
export class TabExecutor {
  #active = new Map();
  async run(tabId, task) {
    if (this.#active.has(tabId)) throw new Error('PAGE_BUSY: another session is executing on this page.');
    const marker = {}; this.#active.set(tabId, marker);
    try { return await task(); } finally { if (this.#active.get(tabId) === marker) this.#active.delete(tabId); }
  }
}
