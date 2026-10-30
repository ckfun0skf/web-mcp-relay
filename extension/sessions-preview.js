import { SessionRegistry } from './session-registry.mjs';
const $ = id => document.getElementById(id); const registry = new SessionRegistry();
const target = { tabId: 101, documentId: 'demo-document-a', origin: 'https://example.com' };
function addDemo(name, t = target) { const s = registry.create({ ...t, name }); registry.transport(s.id, 'connected'); return s; }
addDemo('Research Agent'); const paused = addDemo('Writing Agent'); registry.pause(paused.id, true); const offline = addDemo('Coding Agent', { tabId: 102, documentId: 'demo-document-b', origin: 'https://example.org' }); registry.transport(offline.id, 'disconnected');
function node(tag, text) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; return e; }
function action(text, run) { const b = node('button', text); b.onclick = () => { try { run(); render(); } catch (e) { $('feedback').textContent = e.message; } }; return b; }
function render() {
  const all = registry.list(), query = $('search').value.trim().toLowerCase(), filter = $('filter').value; const shown = all.filter(s => (s.name + ' ' + s.origin).toLowerCase().includes(query) && (filter === 'all' || (filter === 'paused' ? s.paused : !s.paused && s.status === filter)));
  $('groups').replaceChildren(); $('end-all').disabled = !all.length; const groups = new Map(); for (const s of shown) { const key = s.tabId + ':' + s.origin; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(s); }
  for (const sessions of groups.values()) { const section = node('section'); section.className = 'group card'; const heading = node('div'); heading.className = 'group-title'; heading.append(node('h2', sessions[0].origin), node('span', 'Demo tab ' + sessions[0].tabId)); section.append(heading);
    for (const s of sessions) { const row = node('article'); row.className = 'session-row'; const name = node('div'); const title = node('p', s.name); title.className = 'session-name'; const meta = node('p', s.mode === 'ask' ? 'Ask each time' : 'Session trust'); meta.className = 'session-meta'; name.append(title, meta); const state = node('span', s.paused ? 'Paused' : s.status === 'connected' ? 'Connected' : 'Disconnected'); state.className = 'state'; const actions = node('div'); actions.className = 'session-actions'; const copy = node('button', 'Copy key'); copy.disabled = true; copy.title = 'Unavailable in this prototype. No live agent keys are created.'; actions.append(copy);
      if (s.status === 'connected') actions.append(action(s.paused ? 'Resume' : 'Pause', () => registry.pause(s.id, !s.paused))); else actions.append(action('Reconnect demo', () => registry.transport(s.id, 'connected')));
      actions.append(action('Rename', () => { const value = prompt('Session label (not a verified agent identity)', s.name); if (value !== null) registry.rename(s.id, value); }), action('End', () => { if (confirm('End demo session ' + s.name + '? Other sessions are unaffected.')) registry.end(s.id); })); row.append(name, state, actions); section.append(row);
    } $('groups').append(section);
  }
  if (!shown.length) { const empty = node('p', all.length ? 'No sessions match your filter.' : 'No demo sessions. Add one to explore the layout.'); empty.className = 'empty'; $('groups').append(empty); }
}
$('add').onclick = () => { addDemo('New Agent'); $('search').value = ''; $('filter').value = 'all'; render(); $('feedback').textContent = 'Demo session added on demo tab 101. Existing sessions were not replaced.'; }; $('end-all').onclick = () => { if (!confirm('End all demo sessions? This does not affect the real extension engine.')) return; for (const s of registry.list()) registry.end(s.id); render(); }; $('search').oninput = render; $('filter').onchange = render; render();
