# Background-owned UX (0.4.0)

All project-authored deliverables use English. The extension toolbar popup is a view/controller, not a WebSocket owner. background.js owns session and execution state and uses native.js for discovery and execution. There are no active docking or independent connection windows.

## Setup lock

Fresh configuration shows preparation and deployment. The secret is prepared and saved as a temporary extension session draft before Cloudflare opens; this survives popup closure. Source URL is supplied, secret is not included in the URL. The draft is removed after successful connection.

A configured relay leads to the dashboard. Settings is a separate edit state with Cancel, not a Back route through deployment. Confirmed Reset clears relay credentials, temporary setup draft and active session, but does not delete Cloudflare resources. Existing 0.3 credentials are migrated to configured status. Failed connection is an error/retry state, not a reason to reset onboarding.

## Lifecycle

Closing popup has no disconnect handler. The background sends 20-second keepalive frames. UI refresh reads the actual background state. Network/worker loss is shown as disconnected with Resume, not fake connected status. Session records are in TRUSTED_CONTEXTS chrome.storage.session; OWNER_SECRET remains local persistent storage. No execution trust is persisted.

Same-origin target reload keeps the existing socket/key, blocks dispatch while loading, rejects pending approval and reinspects the new document. Snapshots incorporate document identity. Cross-origin navigation ends the session. Same-origin rebind requires WebMCP support; otherwise it remains unavailable until explicit Resume. Resume reuses only a same-relay/tab/origin unexpired key, clamps expiry to the original local deadline, does not extend it intentionally and never replays an operation. The current relay retains its per-socket server TTL; no stronger server-side permanent-revocation claim is made.

## Approval

Ask-every-time is default. Pending approval uses a toolbar ! badge and appears when the user opens the popup; timeout is 45 seconds. Trust requires an explicit checkbox for the current session/document. It covers reads, writes, deletes and submissions and is revoked on pause/navigation/detach. Client/browser approval policies are not bypassed. Already-started effects cannot be undone.

## Acceptance tests (not yet browser-verified)

- First setup, clipboard/deployment errors, key draft after popup close, configured dashboard, Settings Cancel, Reset confirmation.
- Credential migration and exact-origin separation; no website access to extension secrets.
- Close popup during a connection and verify remote list/call still works; reopen and recover the same key/status.
- Same-origin reload keeps key, blocks loading calls, changes document snapshot and revokes trust.
- Cross-origin navigation/tab close ends session; switching focus does not retarget.
- Trust on/off, Pause, pending badge/approval timeout, stale approval rejection.
- Network loss, explicit Resume, original expiry and old-socket race; no write replay.
- Forced service-worker shutdown versus ordinary WebSocket keepalive; no guaranteed permanent background process.
- Legacy controller no longer loads an engine; no injected dock or newly opened control window.
