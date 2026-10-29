# Session handoff and detection (0.5.1)

Connect Now in the in-page hint opens a compact extension-owned session panel. It initially waits for the relay handshake and exposes Copy Session Key and Copy Session & Connector Details only after connection is ready. The (?) link opens connector-help.html. Closing the panel does not disconnect the background engine. A failed window open directs the user to the existing toolbar popup instead.

The page URL contains only a non-capability internal session identifier, never the session key. Only the allowlisted extension-owned session page can request handoff data; website/content-script routes cannot obtain it. The panel is tied to that session and clears fields when it ends, expires, disconnects or is replaced. There is no automatic session-key copy, automatic trust, or automatic connector installation. The copy bundle includes the MCP URL, temporary session key, expiry and list/call instructions. OWNER_SECRET is never included.

Site availability now requires at least one discovered same-reported-origin tool. apiAvailable separately records browser API presence. An API-present page with zero tools does not receive a WebMCP available hint. This is evidence of tools detected now, not a claim that an empty page can never register tools later. Automatic polling remains in place for delayed registration.

Upgrade by updating local files, reloading the extension and refreshing existing target pages. Manifest version is 0.5.1. No relay changes are included.

Not yet browser/cloud end-to-end verified. Test no-API and API-with-zero-tools pages, delayed registration, real tools, successful/failed handshake, private panel clipboard and manual fallback, (?) navigation, session replacement/expiry, and negative attempts to obtain session-handoff from content scripts.
