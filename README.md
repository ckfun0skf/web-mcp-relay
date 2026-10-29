# Web MCP Relay

Experimental Chrome extension bridging native WebMCP tools to remote MCP clients through your own Cloudflare relay. Apache-2.0. Project deliverables use English.

## Layout

- extension/: Manifest V3 extension; load unpacked, no build step.
- relay/: independently deployable Cloudflare Worker and Durable Object.
- Root package.json/wrangler.jsonc: full-repository deployment entrypoint.

## Setup and normal use

Load extension/ using chrome://extensions, then open a trusted WebMCP webpage and click the extension icon. Native document.modelContext.getTools()/executeTool() is required; older APIs are not emulated. Tool discovery is read-only and local.

First-time setup prepares OWNER_SECRET before opening Cloudflare, copies it, and opens the preselected source. Configure the same value in Cloudflare. Wait for Success! Build completed. and copy the HTTPS URL below Deployed web-mcp-relay triggers (use the actual name if renamed). Enter the base URL without /mcp and verify/connect.

Once credentials are configured, the popup opens a dashboard, not the deployment wizard. Settings edits the relay/secret. Only an explicitly confirmed Reset setup clears credentials and returns to onboarding. There is no Back button to re-enter deployment during ordinary use.

Add the displayed /mcp URL to ChatGPT as a custom remote MCP connection, authentication None for this MVP. Use list_browser_tools with session_key, then call_browser_tool with its tool_id, snapshot and arguments. Remote-client availability and approval policies are independent.

## Background sessions

The service worker owns WebSocket, session, approval and native execution state. Closing the toolbar popup does not disconnect. A 20-second WebSocket keepalive supports the Chrome 116+ service-worker lifecycle; native WebMCP may require a newer browser. No hidden visible controller window is needed.

Session keys are saved in chrome.storage.session, not website storage. Same-tab, same-origin page refresh preserves the key, revokes trust, rejects pending approvals and rebinds the new document. Document identity is included in snapshots, invalidating old-document calls. If WebMCP is not ready after load, execution remains unavailable; Resume reinspects and can reuse the unexpired key.

Resume after network loss or service-worker restart is explicit, never a replay of tool calls. It reuses the key only for the same relay/tab/origin before its original local deadline. The existing relay assigns its own deadline per socket; the background enforces the earlier original deadline and closes at expiry. Resume can fail while an old socket is closing. Browser restart/extension reload clears session storage. Browser termination, network loss and forceful worker shutdown are not guaranteed away by keepalive.

End session, target-tab close, expiry, cross-origin navigation and Reset clear the saved session and close its route. Switching active tabs never retargets a live session automatically. Session keys are secret capabilities and must not be shared publicly.

## Credentials and trust

OWNER_SECRET remains the relay variable name. Credentials are stored by exact HTTPS origin in chrome.storage.local with TRUSTED_CONTEXTS access; no Chrome Sync or encrypted OS vault is claimed. Secrets never enter page DOM/MAIN world. Popup and background communicate only through an allowlisted extension-owned message handler. No web-accessible UI resources are declared. Optional host access is requested for the selected relay origin; page tool access uses activeTab and scripting.

Explicit Trust this page for this session allows ALL tools, including writes/deletes/submissions, without extension approval. It is not restored from storage and is revoked on reload/navigation, detach and expiry. Pause revokes trust. Ask-every-time requests appear in the popup; a toolbar ! badge indicates pending approval. No approval window is automatically opened. Closing the popup does not reject pending approval immediately; it times out after 45 seconds.

No docking or ChatGPT iframe embedding. app.html is a retirement notice; old app.js/setup.js/dock files are inert legacy assets and are not referenced by the active UI or manifest. Reload old webpages and close legacy controllers when upgrading.

## Limits and verification

One live session per extension instance, at most 50 same-origin/top-document tools, one pending relay operation and no automatic retries of writes. Metadata is untrusted. Snapshot checks do not prove tool implementation immutability. Limits use JavaScript string length, not KiB. Cancellation cannot stop arbitrary already-started website code or undo effects. Authentication does not eliminate public-endpoint quota abuse.

This migration is not browser/cloud end-to-end verified. See [UX](docs/UX.md), [Popup](docs/POPUP.md), [Deployment](docs/DEPLOYMENT.md) and [Repository visibility](docs/REPOSITORY-VISIBILITY.md). Both root and standalone relay deployments remain supported. No relay source/protocol change is required by this migration.
