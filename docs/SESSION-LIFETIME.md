# No automatic session expiry (0.7.0)

This document supersedes time-based lifetime descriptions in earlier version documents. Sessions no longer have a one-hour or idle TTL in either the extension or relay. Extension records use deadline: null; the relay sends expiresAt: null and advertises sessionExpiry: manual in /health. No Infinity or artificial far-future dates are used.

The extension removes deadline checks and the expiry timer. Same-relay/tab/origin Resume reuses a saved key regardless of elapsed time. Legacy records remaining in chrome.storage.session are migrated to deadline: null; already-cleared records are not recoverable. The relay removes alarm scheduling and time checks; leftover alarms from an older deployment are ignored and deleted rather than closing sockets. Individual request/handshake/manual-approval timeouts remain unchanged.

## Upgrade both components

Deploy the updated relay Worker and update/reload the extension, then reconnect. Old extensions expect a numeric expiresAt and are incompatible with the new handshake. The new extension refuses an old relay with an explicit deployment message rather than claiming sessions cannot expire while the server still has a TTL. /health must report sessionExpiry: manual. No Cloudflare deployment is performed merely by this code-edit action, though an existing Git deployment pipeline may deploy commits.

## Lifetime is not connectivity

End session, target-tab close, cross-origin navigation, credential/setup changes and target replacement still end the session route. Network loss, browser/process termination, Worker deployments and service-worker interruption can still disconnect. Session records remain in chrome.storage.session, so browser restart, extension reload/removal/disable can clear them. This change does not promise persistent keys across browser restart or automatic reconnection. Tools and trust are still bound to the selected document and policy; no automatic write retries or trust restoration are added.

A longer-lived capability has a longer exposure window if copied or leaked. Keep it private and explicitly End session when done. Ending clears the extension's saved key and closes its browser route; no claim of a permanent server-side key tombstone is made.

## Verification

Browser/cloud end-to-end tests have not been run. Verify a connection past one hour, idle and active use, absence of scheduled TTL alarms, harmless legacy alarms, explicit close, tab close, cross-origin navigation, network loss/Resume with the same key, permission/trust regression, copied no-expiry text and old/new component incompatibility messages.
