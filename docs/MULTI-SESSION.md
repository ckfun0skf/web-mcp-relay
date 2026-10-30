# Multi-session migration: phase 1

Status: foundation and UX prototype only. The active background engine remains single-session. This commit does not enable concurrent real agent connections and does not modify the manifest, toolbar popup, deployed relay or live policy implementation. No automatic CI workflow is added.

## Added

SessionRegistry stores independent records, keys, ephemeral trust, tool fingerprints, pause flags and revision stamps. Public list/get summaries exclude capabilities. capability() is privileged internal access and must not be exposed through a generic content-script route. No time-based expiry exists. End clears that record's key. Refresh invalidates all affected document grants while preserving keys; cross-origin rebind ends only matching-tab sessions.

TabExecutor allows work on different tabs while rejecting overlapping execution on the same tab with PAGE_BUSY. It keeps the lock until actual task settlement, even if an external caller times out. A rejected busy operation is not queued or automatically retried. Approval must occur outside the lock and authorization/document stamps must be rechecked inside it immediately before dispatch. The registry is a data layer, not a complete security boundary or socket engine.

## UX preview

Open extension/sessions-preview.html as an extension-owned page after updating local files. It deliberately has no default popup/management navigation link yet. A prominent Demo label distinguishes simulated connections from live sessions. It supports grouped website/tab rows, search/status filtering, simulated pause/resume/reconnect, rename, independent end, and confirmed end-all. Copy key is disabled. No credential is copied, relay contacted, or real session modified. Refreshing resets demo fixtures. The layout is responsive; essential row actions remain visible without expanding diagnostics.

## Checks

Run node --test extension/session-registry.test.mjs manually. Seven tests passed in the development Node environment: independent same-page keys and secret-free summaries, permission/pause isolation, stale-decision rejection, refresh key retention and trust invalidation, selective lifecycle termination, cross-tab concurrency/same-tab exclusion, and failure lock release. No real browser, WebSocket, service-worker or Cloudflare integration tests have run. The endTab helper, clipboard, default cryptographic generator, persistent site policy and full UI require further tests.

## Remaining integration

1. Replace the active singleton engine and policy scope with per-session runtimes and independent sockets, heartbeats, pending requests, approval tokens and session records. Preserve a legacy session record on migration without duplicating credentials.
2. Reuse the existing relay's key-hash routing with one owner-authenticated browser socket per distinct session; verify actual multi-session behaviour rather than removing same-key duplicate-socket protection.
3. Add explicit session IDs to popup, hint, private copy panel and permission-dialog messages. Never select targets from a global current-session variable. Website trust revocation must invalidate every matching runtime.
4. Add a real Sessions manager, popup current-tab summaries and Add Agent Session entry points. Bind approvals to session name, target origin, document, registry and request ID.
5. Keep background keys in trusted extension storage; avoid putting capabilities in management summaries, website DOM or content messages. Keys remain separate from optional website execution trust.
6. Verify multiple tabs, two agents on one page, independent pause/end/approval, same-page dispatch exclusion, refresh, tab closure, wrong-session messages, network loss and non-expiring Resume. Only after integration should the preview be replaced by live management.
