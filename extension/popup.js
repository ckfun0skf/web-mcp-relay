const $ = id => document.getElementById(id);
let selected = null, sequence = 0;
function element(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function renderTool(tool) {
  const card = element('article', undefined, 'tool-card');
  card.append(element('h2', tool.name), element('p', tool.description || 'No description provided.'));
  let schema;
  try { schema = typeof tool.inputSchema === 'string' ? JSON.parse(tool.inputSchema) : tool.inputSchema; } catch {}
  if (schema?.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)) {
    const list = element('ul', undefined, 'parameters');
    for (const [name, definition] of Object.entries(schema.properties)) {
      const type = Array.isArray(definition?.type) ? definition.type.join(' | ') : definition?.type || 'schema';
      const required = Array.isArray(schema.required) && schema.required.includes(name);
      list.append(element('li', name + ' · ' + type + (required ? ' · required' : ' · optional')));
    }
    card.append(list.children.length ? list : element('p', 'No named parameters.', 'hint'));
  } else card.append(element('p', 'See input schema for parameter requirements.', 'hint'));
  const details = element('details'); details.append(element('summary', 'Input schema'), element('pre', typeof tool.inputSchema === 'string' ? tool.inputSchema : JSON.stringify(tool.inputSchema ?? null, null, 2))); card.append(details);
  if (tool.annotations) { const hints = element('details'); hints.append(element('summary', 'Tool hints (not permissions)'), element('pre', JSON.stringify(tool.annotations, null, 2))); card.append(hints); }
  return card;
}
async function scan() {
  const current = ++sequence; selected = null; $('setup').disabled = true; $('refresh').disabled = true; $('count').textContent = '…'; $('tools').replaceChildren(); $('discovery-status').textContent = 'Checking native WebMCP…'; $('scan-time').textContent = '';
  let timeout;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:\/\//.test(tab.url || '')) throw new Error('Open an HTTP or HTTPS webpage, then click the extension icon. Chrome internal pages and other restricted pages cannot be inspected.');
    const origin = new URL(tab.url).origin; $('page').textContent = origin;
    const task = chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, world: 'MAIN', func: discover, args: [origin] });
    const results = await Promise.race([task, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Discovery timed out. The page may be busy; refresh and try again.')), 8000); })]);
    if (current !== sequence) return;
    const frame = results[0]; const result = frame?.result;
    if (!frame?.documentId || !result?.ok) throw new Error(result?.error || 'Could not inspect this page. Reload it and reopen the extension.');
    selected = { tabId: tab.id, documentId: frame.documentId, origin }; $('setup').disabled = false;
    if (!result.available) {
      $('count').textContent = 'N/A'; $('discovery-status').textContent = 'Native WebMCP discovery is unavailable.';
      $('tools').append(element('p', 'This page/browser does not expose document.modelContext.getTools(). Check browser support and the page setup. No legacy API or polyfill is used.', 'empty'));
    } else {
      $('count').textContent = String(result.total);
      $('discovery-status').textContent = result.total ? 'WebMCP tools detected' : 'WebMCP API available · no tools exposed';
      if (!result.executable) $('discovery-status').textContent += ' · native execution API unavailable';
      if (!result.total) $('tools').append(element('p', 'The page currently exposes no tools in the selected top-document origin. Enable its tool consent or finish loading the demo, then refresh.', 'empty'));
      else $('tools').append(...result.tools.map(renderTool));
      if (result.total > result.tools.length) $('tools').append(element('p', 'Showing the first ' + result.tools.length + ' of ' + result.total + ' tools.', 'hint'));
    }
    $('scan-time').textContent = 'Checked ' + new Date().toLocaleTimeString() + '. Refresh after tools change.';
  } catch (error) { if (current === sequence) { $('count').textContent = '!'; $('discovery-status').textContent = 'Discovery failed'; $('tools').append(element('p', String(error.message || error), 'empty')); } }
  finally { clearTimeout(timeout); if (current === sequence) $('refresh').disabled = false; }
}
async function discover(expectedOrigin) {
  try {
    if (location.origin !== expectedOrigin) throw new Error('The page navigated. Reopen the popup on the intended page.');
    const context = document.modelContext;
    if (!context || typeof context.getTools !== 'function') return { ok: true, available: false };
    const tools = Array.from(await context.getTools()).filter(tool => !tool.origin || tool.origin === expectedOrigin);
    const descriptors = tools.slice(0, 50).map(tool => ({ name: String(tool.name || 'Unnamed tool').slice(0, 200), description: String(tool.description || '').slice(0, 4000), inputSchema: typeof tool.inputSchema === 'string' ? tool.inputSchema : JSON.parse(JSON.stringify(tool.inputSchema ?? null)), ...(tool.annotations ? { annotations: JSON.parse(JSON.stringify(tool.annotations)) } : {}) }));
    if (JSON.stringify(descriptors).length > 256000) throw new Error('Tool metadata exceeds this preview limit.');
    return { ok: true, available: true, executable: typeof context.executeTool === 'function', total: tools.length, tools: descriptors };
  } catch (error) { return { ok: false, error: String(error.message || error).slice(0, 1000) }; }
}
$('refresh').onclick = scan;
$('setup').onclick = async () => {
  if (!selected) return; $('setup').disabled = true;
  try { const response = await chrome.runtime.sendMessage({ type: 'open-controller', ...selected }); if (!response?.ok) throw new Error(response?.error || 'Could not open connection setup.'); window.close(); }
  catch (error) { $('discovery-status').textContent = String(error.message || error); $('setup').disabled = false; }
};
scan();
