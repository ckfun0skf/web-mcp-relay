export async function inspectTab(tabId, expectedDocumentId) {
  const tab = await chrome.tabs.get(tabId);
  if (!/^https?:\/\//.test(tab.url || '')) throw new Error('Select an accessible HTTP(S) webpage.');
  const origin = new URL(tab.url).origin;
  const target = expectedDocumentId ? { tabId, documentIds: [expectedDocumentId] } : { tabId, frameIds: [0] };
  const frame = (await chrome.scripting.executeScript({ target, world: 'MAIN', func: nativeOperation, args: ['list', origin, {}] }))[0];
  if (!frame?.documentId || !frame.result?.ok) throw new Error(frame?.result?.error || 'Page unavailable or document changed.');
  const result = frame.result.value;
  result.documentId = frame.documentId;
  result.snapshot = await hash(frame.documentId + ':' + result.metadataSnapshot);
  return result;
}
export async function executeNative(tabId, listing, request) {
  const frame = (await chrome.scripting.executeScript({ target: { tabId, documentIds: [listing.documentId] }, world: 'MAIN', func: nativeOperation, args: ['call', listing.origin, { ...request, metadataSnapshot: listing.metadataSnapshot }] }))[0];
  if (!frame?.result?.ok) throw new Error(frame?.result?.error || 'Native execution failed; outcome may be unknown.');
  return frame.result.value;
}
async function hash(value) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join(''); }
async function nativeOperation(operation, origin, request) {
  try {
    if (location.origin !== origin) throw new Error('Origin changed.');
    const context = document.modelContext;
    if (!context || typeof context.getTools !== 'function') return { ok: true, value: { origin, available: false, apiAvailable: false, executable: false, tools: [], metadataSnapshot: '' } };
    const native = Array.from(await context.getTools()).filter(t => !t.origin || t.origin === origin);
    if (native.length > 50) throw new Error('This adapter supports at most 50 tools.');
    const tools = native.map((t, i) => ({ tool_id: String(i), name: String(t.name), description: String(t.description || ''), inputSchema: typeof t.inputSchema === 'string' ? JSON.parse(t.inputSchema) : JSON.parse(JSON.stringify(t.inputSchema ?? null)), ...(t.annotations ? { annotations: JSON.parse(JSON.stringify(t.annotations)) } : {}) }));
    const encoded = JSON.stringify(tools); if (encoded.length > 64000) throw new Error('Tool metadata exceeds 64,000 string code units.');
    const metadataSnapshot = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(encoded))), b => b.toString(16).padStart(2, '0')).join('');
    const executable = typeof context.executeTool === 'function';
    if (operation === 'list') return { ok: true, value: { origin, available: tools.length > 0, apiAvailable: true, executable, tools, metadataSnapshot } };
    if (!executable || request.metadataSnapshot !== metadataSnapshot) throw new Error('Tools changed or execution API unavailable. List tools again.');
    const index = tools.findIndex(t => t.tool_id === request.tool_id); if (index < 0) throw new Error('Tool not found.');
    const result = await context.executeTool(native[index], request.arguments);
    const json = JSON.stringify(result === undefined ? null : result); if (json.length > 64000) throw new Error('Result too large; effects may have occurred.');
    return { ok: true, value: JSON.parse(json) };
  } catch (error) { return { ok: false, error: String(error.message || error).slice(0, 1500) }; }
}
