# Onboarding and safe docking (0.2.0)

## Language policy

All project-authored UI text, accessibility labels, messages, code comments, documentation, commit messages and other project deliverables use English. User-supplied website content and tool output are not translated automatically.

The existing app.js transport/native execution engine is unchanged. app.html provides a five-step English setup wizard: deploy, secret, health verification, WebSocket connection and ChatGPT handoff. Back/Next does not reload the engine. Cloudflare deployment opens a separate popup; closing it never implies success. An existing-relay route is available. Actual Cloudflare wizard labels and deployment success still require live testing.

Optional host permission is requested only for the selected relay origin to run the health check. WebMCP page access remains activeTab + scripting. Declaring broad optional permissions does not grant access to all sites automatically. Only non-secret relay URL, setup progress and layout preference are persisted. Credentials are never included in deployment URLs. The existing transport clears OWNER_SECRET after connecting; reconnecting requires re-entry.

Left/right/bottom controls mount a minimal extension-origin iframe in a closed shadow root on the selected webpage, reserving space using root padding. Separate-window mode removes it and restores previous inline styles. This is not Chrome DevTools or native Side Panel docking. Fixed-position elements and unusual layouts may overlap; style restoration is best effort. Restricted Chrome pages cannot be docked. The dock preference is recorded but is not automatically applied on startup.

Only dock.html, dock.js and style.css are web-accessible. app.html, setup.js and app.js are not exposed. The dock displays sanitized connection status, setup progress and target text, changes placement or focuses the control window. It receives no OWNER_SECRET, session_key or approval arguments. Setup and tool approval remain in the extension-owned popup to reduce clickjacking risk from the embedding site. Pending approval restores and focuses that trusted window.

Docking minimizes rather than closes the existing controller. Session keys and approval state remain in memory; switching mode does not intentionally reconnect. Keep that window open. Browser restart, extension reload or forcibly closing/discarding it still disconnects. The background session directory is ephemeral and refreshed by the controller; service-worker restart can briefly show unavailable. Closing the controller attempts to remove its dock. Website navigation removes the injected panel; old native document bindings remain invalid.

Acceptance tests are not yet browser-verified: initial/repeated setup; Next guards; Back input preservation; secret non-persistence; deployment popup and fallback guide; health compatibility/timeouts; permission denial; reconnect; native API errors; all docking modes without session-key changes; window/style restoration; service-worker idle recovery; controller close cleanup; navigation; approved/denied calls; approval focus; narrow layouts and keyboard access. This language correction changes no relay protocol, permissions, docking behavior or old PoC files.
