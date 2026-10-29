(() => {
  if (globalThis.__webMCPHintInstalled || window.top !== window) return;
  globalThis.__webMCPHintInstalled = true;
  let host, root, message, connectButton, previewButton, preview, latest, dismissed = false, expanded = false, replace = false, busy = false, timer, stopped = false;
  const el = (tag, text) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
  async function rpc(type, extra = {}) { const r = await chrome.runtime.sendMessage({ type, ...extra }); if (!r?.ok) throw new Error(r?.error || 'Extension unavailable.'); return r.value; }
  function hide() { host?.remove(); }
  function build() {
    if (host) return; host = el('div'); root = host.attachShadow({ mode: 'closed' });
    const style = el('style', ':host{all:initial!important;position:fixed!important;right:16px!important;bottom:16px!important;z-index:2147483647!important;width:min(310px,calc(100vw - 32px))!important;color-scheme:dark!important}*{box-sizing:border-box}section{background:#151923;color:#f2f4f8;border:1px solid #485166;border-radius:12px;box-shadow:0 8px 28px #0005;padding:14px;font:13px/1.5 system-ui,sans-serif}header{display:flex;justify-content:space-between;align-items:center}h2{font-size:14px;margin:0}p{margin:8px 0;overflow-wrap:anywhere}button{font:inherit;cursor:pointer;border:1px solid #57647c;background:#242d3d;color:#fff;border-radius:7px;padding:7px 10px}button:focus-visible{outline:3px solid #9cc4ff;outline-offset:2px}button:disabled{opacity:.55;cursor:default}.actions{display:grid;gap:6px}.primary{background:#375fc5;border-color:#6288ea}.close{border:0;background:transparent;padding:0 5px;font-size:19px}.preview{max-height:min(300px,45vh);overflow:auto;margin-top:10px}article{border-top:1px solid #485166;padding:8px 0}h3{margin:0;font-size:13px;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px}[hidden]{display:none!important}');
    const panel = el('section'); panel.setAttribute('aria-label', 'Web MCP Relay connection hint'); const header = el('header'); const close = el('button', '×'); close.className = 'close'; close.setAttribute('aria-label', 'Dismiss WebMCP hint'); close.onclick = e => { if (!e.isTrusted) return; dismissed = true; hide(); }; header.append(el('h2', 'WebMCP available'), close);
    message = el('p', 'This site supports WebMCP.'); message.setAttribute('role', 'status');
    const actions = el('div'); actions.className = 'actions'; connectButton = el('button', 'Connect Now'); connectButton.className = 'primary'; previewButton = el('button', 'See What This Site Can Do'); previewButton.setAttribute('aria-expanded', 'false');
    preview = el('div'); preview.className = 'preview'; preview.hidden = true;
    previewButton.onclick = e => { if (!e.isTrusted) return; expanded = !expanded; preview.hidden = !expanded; previewButton.textContent = expanded ? 'Hide Site Tools' : 'See What This Site Can Do'; previewButton.setAttribute('aria-expanded', String(expanded)); };
    connectButton.onclick = async e => {
      if (!e.isTrusted || busy) return; busy = true; connectButton.disabled = true;
      try { const result = await rpc('hint-connect', { replace }); replace = result.confirmReplace === true; message.textContent = result.message || 'Connecting…'; }
      catch (error) { message.textContent = error.message; }
      finally { busy = false; connectButton.disabled = !latest?.executable || !latest?.tools?.length; clearTimeout(timer); timer = setTimeout(tick, 2000); }
    };
    actions.append(connectButton, previewButton); panel.append(header, message, actions, preview); root.append(style, panel);
  }
  async function tick() {
    clearTimeout(timer);
    if (stopped || dismissed) return;
    if (document.hidden || busy) { timer = setTimeout(tick, 10000); return; }
    try {
      latest = await rpc('hint-read');
      if (latest.connected) { dismissed = true; hide(); return; }
      if (latest.hidden || !latest.available) { hide(); return; }
      build(); if (!host.isConnected) document.documentElement.append(host);
      connectButton.disabled = latest.connecting || !latest.executable || !latest.tools?.length;
      connectButton.textContent = latest.connecting ? 'Connecting…' : 'Connect Now';
      preview.replaceChildren();
      for (const tool of latest.tools || []) { const card = el('article'); card.append(el('h3', tool.name), el('p', tool.description)); const details = el('details'); details.append(el('summary', 'Parameters'), el('pre', JSON.stringify(tool.inputSchema, null, 2))); card.append(details); preview.append(card); }
      if (!latest.tools?.length) preview.append(el('p', 'No tools are currently exposed.'));
    } catch { hide(); if (!chrome.runtime?.id) stopped = true; }
    finally { if (!dismissed && !stopped) timer = setTimeout(tick, latest?.connecting ? 2000 : 10000); }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  tick();
})();
