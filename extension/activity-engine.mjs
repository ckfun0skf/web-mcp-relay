import { MultiEngine } from './multi-engine.mjs';
import { AgentActivity } from './agent-activity.mjs';
export class ActivityEngine extends MultiEngine {
  constructor(io) { super(io); this.agentActivity = new AgentActivity(); this.activityWrites = Promise.resolve(); }
  async init() { await super.init(); const saved = await this.io.store.get('relayAgentActivityV1'); this.agentActivity.restore(saved.relayAgentActivityV1, new Set(this.items.keys())); }
  agent(id) { return this.agentActivity.summary(id, Boolean(this.items.get(id)?.pending)); }
  list() { return super.list().map(s => ({ ...s, ...this.agent(s.id) })); }
  saveActivity() { const relayAgentActivityV1 = this.agentActivity.serialize(new Set(this.items.keys())); this.activityWrites = this.activityWrites.catch(() => {}).then(() => this.io.store.set({ relayAgentActivityV1 })); return this.activityWrites; }
  async request(id, m) { const r = this.get(id); const track = r.status === 'connected' && /^[a-f0-9-]{36}$/.test(m?.id || '') && ['list', 'call'].includes(m?.operation); if (track) { this.agentActivity.begin(id); this.saveActivity().catch(() => {}); } try { return await super.request(id, m); } finally { if (track) this.agentActivity.finish(id); } }
  async end(id) { try { await super.end(id); } finally { if (!this.items.has(id)) { this.agentActivity.remove(id); await this.saveActivity().catch(() => {}); } } }
}
