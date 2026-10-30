export async function startWithPanel({ id, open, start, panelError = () => {}, startError = () => {} }) {
  let panelOpened = true;
  try { await open(id); } catch (e) { panelOpened = false; panelError(e); }
  Promise.resolve().then(start).catch(startError);
  return { id, panelOpened };
}
export function sessionStage(s) {
  if (s?.ended) return 'ended';
  if (s?.status === 'connecting') return 'connecting';
  if (!s?.connected) return 'retry';
  return s.needsChoice ? 'permissions' : 'ready';
}
export function canCopySession(s) { return sessionStage(s) === 'ready' && Boolean(s.key); }
