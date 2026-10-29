# Web MCP Relay

Experimental Chrome extension connecting a selected page's native WebMCP tools to remote MCP clients through a self-hosted Cloudflare relay. Apache-2.0; see LICENSE. All project-authored deliverables use English.

## Layout and status

- extension/: unpacked Manifest V3 extension, no build step.
- relay/: independently deployable Worker and Durable Object.
- Root package.json/wrangler.jsonc: full-repository deployment entrypoint.

This is an experimental implementation, not a browser/cloud end-to-end verified release. Native document.modelContext.getTools()/executeTool() must be available. No legacy testing API, polyfill, DOM automation or custom-registry bypass is installed.

## Three-step setup

1. Prepare: a random OWNER_SECRET is prepared before deployment. Copy secret & deploy opens the official Cloudflare flow with the source repository included. Paste the same value into OWNER_SECRET when prompted, or add it under Worker Settings > Variables and Secrets afterward.
2. Connect: wait for Success! Build completed. in the build log. Copy the HTTPS URL directly below Deployed web-mcp-relay triggers (or the renamed Worker label), paste the base URL without /mcp and select Verify & connect. This checks health, native WebMCP and WebSocket authentication.
3. Ready: add the displayed /mcp URL to ChatGPT with authentication None for this MVP. Verify list_browser_tools/call_browser_tool. Pass the secret session_key from this control window, then use returned tool_id and snapshot values. No old PoC pairing card is used.

Deploy source: https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fckfun0skf%2Fweb-mcp-relay

Both root deployment and standalone relay/ deployment are supported. See [Deployment](docs/DEPLOYMENT.md) and [Repository visibility](docs/REPOSITORY-VISIBILITY.md). User-created copies do not automatically receive upstream changes.

## Load the extension

Open chrome://extensions, enable Developer mode and Load unpacked from extension/. Open a trusted WebMCP page and click the toolbar on that page. The control window remains bound to that tab. For web-mcp-poc, enable its execution consent first. Keep the control window open. There is no docking, website iframe or ChatGPT embedding. After upgrading from 0.2, reload target pages to remove any previously injected dock. Legacy dock files are inert and are not exposed by the manifest.

## Credentials and trust are separate

OWNER_SECRET (not OWNER_KEY) is the unchanged relay environment variable. Use 32-256 letters, digits, underscores or hyphens. Credentials are saved per exact HTTPS origin in chrome.storage.local with TRUSTED_CONTEXTS access. They survive browser restarts, are not synced by this implementation and are not an encrypted OS vault. Never commit credentials or send them to website scripts. Forget saved secret disconnects and removes that relay's saved credential, not its Cloudflare secret. A prepared secret without an entered relay origin is kept only in the current window.

Each connection gets a new one-hour session_key. Treat it as a bearer capability. Remembering OWNER_SECRET does not preserve an old connection or grant tool-execution trust.

Ask-every-time is the default. Explicitly enabling Trust this page for this session allows ALL native tools in the selected document, including writes/deletes/submissions, without extension prompts. It does not disable approvals imposed by the remote client or browser. Trust is never persisted and is revoked on navigation/reload, disconnect, expiry or closing the control window. Pause blocks new tool calls and revokes trust; resume returns to ask-every-time. Already-started code may continue and effects cannot be rolled back.

## Limits and security

One tab per control window; one pending relay operation per session; 60-second relay wait; one-hour expiry. Current wire/registry/result checks use JavaScript string length (128,000/64,000/64,000 respectively), not precise UTF-8 bytes or KiB. The relay also has its own response/body limits. Metadata snapshots detect forwarded metadata changes, not changes to underlying code with identical metadata. Main-world page code and tool output are untrusted; trust the website itself. Only top-document selection is supported, with reported cross-origin tools filtered; tools without a reported origin are accepted by the current adapter.

Website access uses activeTab and scripting. The health check requests optional host access for the selected relay origin (origin-wide permission, not only /health). No debugger permission is requested. app.html is not web-accessible, and no generic storage-reading message API is provided. Public health/tool discovery does not itself grant browser access. OWNER_SECRET authorizes browser connections; session_key authorizes routing. Neither eliminates public-endpoint abuse or guarantees free-tier usage.

See [UX and acceptance tests](docs/UX.md). Do not use consequential tools or real sensitive data until you have reviewed and tested the implementation.
