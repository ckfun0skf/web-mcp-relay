# Web MCP Relay

Experimental Chrome extension connecting a selected page's native WebMCP tools to remote MCP clients through your own Cloudflare relay. Apache-2.0; see LICENSE.

## Layout

- extension/: unpacked Manifest V3 extension, no build step.
- relay/: independently deployable Cloudflare Worker + Durable Object.

## MVP status

Implementation provided for testing, NOT browser/cloud end-to-end verified. Native consumer API required: document.modelContext.getTools()/executeTool(). No polyfill, navigator.modelContextTesting fallback, DOM automation or custom-registry bypass. Reference: https://developer.chrome.com/docs/ai/webmcp/imperative-api

The extension opens a dedicated control window and keeps its WebSocket there. KEEP IT OPEN. This intentionally avoids claiming reliable long-lived connections in a service worker. Closing it disconnects the session. No background reconnection, persistence or split-screen ChatGPT embedding yet.

## Deploy your private relay

Deploy URL (integration not yet verified): https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fckfun0skf%2Fweb-mcp-relay%2Ftree%2Fmain%2Frelay

Deploy the relay subdirectory, not repository root. Create a random OWNER_SECRET of at least 32 characters using a password manager. The deployment wizard should request the secret from relay/.dev.vars.example; never commit a real value. Manual alternative:

```
cd relay
npm install
npx wrangler secret put OWNER_SECRET
npm run deploy
```

For local development copy .dev.vars.example to .dev.vars and replace its value. localhost HTTP is NOT accepted by this MVP extension; use a deployed HTTPS relay for integrated tests. /health contains protocolVersion: 1.

OWNER_SECRET authorizes creating browser sessions, not your Cloudflare account API. Never give the extension a Cloudflare API token. Usage is charged against the account deploying the Worker, not the project's author. Public endpoints can still be abused; application auth does not prevent all platform-level request usage. Not a production multi-tenant service.

## Load extension

1. Open chrome://extensions, enable Developer mode, Load unpacked, select extension/.
2. Enable native WebMCP in a supported Chrome build as required by current Chrome documentation. API changes may require adapting this MVP.
3. Open the target WebMCP page and grant its own tool consent if needed. For web-mcp-poc use playground.html with execution consent checked.
4. Click the extension toolbar button ON THAT PAGE. A control window binds to that tab. No all-sites permission or debugger permission is requested: activeTab + scripting grants are used.
5. Enter your relay base HTTPS URL and OWNER_SECRET. Only the relay URL is saved locally; owner/session secrets stay in control-window memory (password inputs). Connect.
6. A new random one-hour session key is shown. Copy it only to the intended MCP client conversation. It is a bearer capability, not a harmless identifier. Local approval is still required for each call.
7. In ChatGPT add the relay's /mcp as a custom remote MCP connection, authentication None for this MVP (session capability is supplied per tool call). Ensure the tools list contains list_browser_tools and call_browser_tool. Connector availability depends on account/workspace. No OAuth or pairing card is implemented.
8. Ask list_browser_tools with session_key; then call_browser_tool with session_key, tool_id, snapshot and arguments from that list. In the control window review the exact page/tool/arguments, then Allow once or Deny. No tool executes automatically.

Closing/navigating the bound tab invalidates its document binding; click the toolbar again to select a new document. Switching the active tab does not retarget a session. Frames other than the top document are excluded; only tools whose reported origin matches the bound origin are forwarded. The same site can lie about descriptions/results or act maliciously: trust the site itself.

## Tests to perform

- Health endpoint, initialize and MCP tools/list return expected schemas.
- Unsupported page/browser returns an explicit API error (no fallback).
- List and call PoC read_text/write_text through native WebMCP; confirm in the local window. Verify no direct app callback route exists.
- Deny a call; verify no execution. Change registry after listing; old snapshot must fail.
- Switch browser focus; confirm bound tab remains unchanged. Navigate/reload/close target: old document must fail.
- Disconnect/expire session and verify old session_key cannot execute.
- Missing/wrong OWNER_SECRET must reject WebSocket upgrades. A new session requires a new random key.
- Check oversized results/requests and ambiguous timeout behavior. NEVER auto-retry writes.

## Security and limits

Initial limits: one tab per control window/session; one in-flight relay request per session; 60-second relay wait; one-hour session lifetime; 128 KiB wire messages; 64 KiB results. Native tools may continue after timeout/disconnect and side effects cannot be rolled back. Local confirmation occurs in extension UI; tool descriptions and arguments are untrusted application data. Do not enter real credentials or use consequential tools until reviewed/tested.

Page code is accessed through a serializable MAIN-world chrome.scripting function targeting a fixed documentId, with immediate origin and snapshot checks. Native RegisteredTool objects are kept inside that invocation and are never serialized to MCP. inputSchema strings are parsed for model-facing metadata. A listing returns ephemeral tool IDs, not assumed globally unique names. Each execution re-lists and compares the snapshot before native executeTool.

Known limits: WebMCP browser APIs may impose additional user-activation/permission requirements; same-world hostile page JS cannot be treated as a security sandbox. Extension actions can bypass neither browser permissions nor site authorization. The relay uses the official MCP SDK with stateless JSON responses; connector compatibility, migrations and deployment button flow still require live testing. No automated update PR system, release lockfile or production hardening yet. Unauthenticated health/tools discovery is intentional; session_key is required for browser operations. Secrets in WebSocket subprotocol headers must be redacted from logs. Treat relay operators as trusted because session traffic passes through them.
