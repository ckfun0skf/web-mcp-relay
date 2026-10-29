# Window-only onboarding and session trust (0.3.0)

All project-authored UI, messages, comments and documentation use English.

## Setup

Three screens: Prepare & deploy, Verify & connect, Ready. Prepare a valid OWNER_SECRET before opening Cloudflare. The primary action copies the secret before opening the deployment popup. Clipboard failure prevents opening it and gives recovery instructions. The deployment source is the full repository and is supplied through the official url parameter. No secret is placed in the URL.

Cloudflare sign-in and repository creation remain explicit user actions. Wait for Success! Build completed. Copy the HTTPS Worker URL directly below Deployed web-mcp-relay triggers; a renamed Worker changes that label. Next/Back preserves in-memory fields. Verify & connect combines optional permission, health, native WebMCP and WebSocket checks. Errors remain in the Connection card rather than being replaced by a generic Next guard.

## Credentials

The environment variable remains OWNER_SECRET. User credentials are saved per exact relay origin in chrome.storage.local, with TRUSTED_CONTEXTS access established before storage reads/writes. No Chrome Sync, content-script credential access or generic read-storage messaging is added. This is extension-isolated persistence, not OS-vault encryption. The prepared key is not saved until a valid relay connection attempt reaches the WebSocket phase; it is retained for retry even if authentication later fails. Forget removes the selected relay credential and disconnects.

A new UI window loads the saved secret for its last relay. Editing to another relay loads that origin's saved secret if present; otherwise the current prepared/input value remains available for first deployment. Credentials are never silently fetched for a different origin during connection. The displayed relay must always be reviewed before connecting.

## No docking

Only the independent extension control window is supported. No page layout mutations, iframe injection, docking commands or web-accessible UI resources remain active. dock.html/dock.js are retained only as inert legacy files; they are not referenced by the manifest/background/setup flow. Reload webpages after upgrading to remove old injected panels. Closing the window disconnects; minimizing it does not intentionally reconnect.

## Session trust

Default is Ask every time. Trust this page for this session requires a deliberate checkbox action after connection. It covers ALL tools, including writes, deletes and submissions, for the selected document on the current connection. It is never saved to storage. There is no readOnlyHint-based security assumption. Navigation/reload, disconnect, expiry and window close revoke trust; fixed documentId injection is retained. Pause blocks new executions, rejects a pending manual approval and revokes trust. Resume does not re-enable it. Other clients/browser permission prompts are independent.

Tool listing remains read-only and does not require per-call local approval. Automatic and manual execution use the same native WebMCP, snapshot, argument-shape, expiry and serialization checks. Activity records tool names and outcomes, not secrets or full arguments. Metadata-only snapshots cannot prove implementation immutability. Cancellation is not hard termination and side effects cannot be rolled back.

## Acceptance tests (not yet browser-verified)

- Fresh setup generates key before deployment; source is prefilled; key never appears in deployment URL.
- Clipboard failure, deployment failure, Back/Next and existing-relay route.
- Correct/wrong key and URL; health, native API and handshake error visibility.
- Close/reopen browser and verify saved origin-bound key; Forget; content-script storage isolation.
- Trust off prompts; trust on executes reads/writes without local prompt; toggling off restores prompts.
- Pause, reconnect, expiry, reload, same-origin/cross-origin navigation and window close revoke trust.
- Switching active tabs does not retarget; changed document cannot execute with old binding.
- Oversized result, ambiguous timeout, no automatic retry, and user-client approval differences.
- Upgrade from old dock mode: no new injection and old panels disappear on page reload.

No relay protocol or Cloudflare secret name changes are introduced by this revision.
