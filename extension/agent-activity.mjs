export class AgentActivity {
  constructor(now = Date.now) { this.now = now; this.records = new Map(); this.active = new Map(); }
  begin(id) { const prior = this.records.get(id); const time = Math.max(this.now(), prior?.agentLastSeenAt || 0); this.records.set(id, { agentFirstSeenAt: prior?.agentFirstSeenAt ?? time, agentLastSeenAt: time, agentRequestCount: Math.min(Number.MAX_SAFE_INTEGER, (prior?.agentRequestCount || 0) + 1) }); this.active.set(id, (this.active.get(id) || 0) + 1); }
  finish(id) { const n = this.active.get(id) || 0; if (n <= 1) this.active.delete(id); else this.active.set(id, n - 1); }
  remove(id) { this.records.delete(id); this.active.delete(id); }
  summary(id, pending = false) { const record = this.records.get(id); return { agentFirstSeenAt: record?.agentFirstSeenAt ?? null, agentLastSeenAt: record?.agentLastSeenAt ?? null, agentRequestCount: record?.agentRequestCount || 0, agentPhase: pending ? 'approval' : this.active.has(id) ? 'processing' : record ? 'seen' : 'waiting' }; }
  serialize(validIds) { return Object.fromEntries([...this.records].filter(([id]) => validIds.has(id)).map(([id, r]) => [id, { ...r }])); }
  restore(data, validIds) { this.records.clear(); this.active.clear(); for (const [id, r] of Object.entries(data || {})) if (validIds.has(id) && r && Number.isFinite(r.agentFirstSeenAt) && Number.isFinite(r.agentLastSeenAt) && r.agentFirstSeenAt >= 0 && r.agentLastSeenAt >= r.agentFirstSeenAt && Number.isSafeInteger(r.agentRequestCount) && r.agentRequestCount > 0) this.records.set(id, { agentFirstSeenAt: r.agentFirstSeenAt, agentLastSeenAt: r.agentLastSeenAt, agentRequestCount: r.agentRequestCount }); }
}
export function formatAgentActivity(s, now = Date.now()) {
  if (!s?.agentRequestCount || !Number.isFinite(s.agentLastSeenAt)) return 'Waiting for agent';
  if (s.status === 'connected' && s.agentPhase === 'approval') return 'Awaiting your approval';
  if (s.status === 'connected' && s.agentPhase === 'processing') return 'Processing agent request';
  const seconds = Math.max(0, Math.floor((now - s.agentLastSeenAt) / 1000)); const ago = seconds < 5 ? 'just now' : seconds < 60 ? seconds + 's ago' : seconds < 3600 ? Math.floor(seconds / 60) + 'm ago' : seconds < 86400 ? Math.floor(seconds / 3600) + 'h ago' : Math.floor(seconds / 86400) + 'd ago';
  return seconds < 15 && s.status === 'connected' ? 'Agent activity detected · ' + ago : 'Last active ' + ago;
}
