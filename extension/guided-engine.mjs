import { ActivityEngine } from './activity-engine.mjs';
import { startWithPanel } from './session-flow.mjs';
export class GuidedEngine extends ActivityEngine {
  list() { return super.list().map(s => { const r = this.items.get(s.id); return { ...s, error: s.status === 'disconnected' ? r.log[0] || 'Relay disconnected. Retry this session.' : '', handoffError: r.handoffError || '' }; }); }
  async create({ relay, tabId, documentId, name = '' }) {
    if (this.items.size >= 32) throw new Error('Session limit reached (32). End unused sessions first.');
    const listing = await this.io.inspect(tabId, documentId);
    if (!listing.available || !listing.executable) throw new Error('No executable WebMCP tools.');
    if (this.items.size >= 32) throw new Error('Session limit reached (32).');
    const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
    const r = this.add({ id: crypto.randomUUID(), key, relay, tabId, origin: listing.origin, name: String(name).trim().slice(0, 80), createdAt: Date.now() });
    await this.persist();
    await startWithPanel({ id: r.id, open: id => this.io.openSession(id), start: () => this.connect(r.id, listing), panelError: e => { r.handoffError = String(e.message || e); }, startError: e => { if (this.items.get(r.id) === r) { r.log.unshift(String(e.message || e)); r.log = r.log.slice(0, 20); } } });
    return r.id;
  }
}
