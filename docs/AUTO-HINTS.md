# Automatic connection hints (0.5.0)

The extension can show a compact bottom-right WebMCP hint without opening the toolbar dashboard. It contains Connect Now, See What This Site Can Do, and a dismiss control. The preview expands inside the hint with a bounded scrolling area and uses textContent for tool metadata. It never executes tools or requires a relay connection.

## Enable

Reload the extension after upgrading. Right-click its toolbar icon and choose Options (or use Extension options in chrome://extensions). Enable one explicit HTTP(S) site or optionally grant all HTTP(S) sites. No broad website permission is required at install. Hints default to enabled only where host access has already been granted. Existing relay grants therefore do not imply access to unrelated webpages. Host permissions may be broader than a single port according to browser match-pattern semantics.

The service worker dynamically registers an isolated, top-frame content script on granted origins and inspects document.modelContext through native.js in MAIN world. Discovery runs on visible active pages at roughly ten-second intervals, or two seconds during connection. Native availability may require a newer browser than the extension's Chrome 127 minimum. Unsupported/protected pages do not receive a working hint.

## Connection and security

Connect Now binds to the sender's actual tab and document, using only stored relay settings. Missing credentials/relay permission opens the extension popup where supported, with text directing the user to finish setup. Switching away from another live target requires a second explicit click. The background rechecks the document before connecting and never enables trust automatically. Session keys, OWNER_SECRET, pending approval arguments and full engine state are not sent to content scripts or put in website DOM. Only discovery metadata and reduced status are returned. No window.postMessage bridge is exposed.

The content script uses a closed shadow root for CSS isolation, not an anti-spoofing security boundary. A website can still imitate, cover or remove in-page UI. Never enter secrets in an in-page hint; session trust and tool approval remain in the extension-owned popup.

Hints disappear after successful connection or dismissal for the current document. Disabling hints stops discovery on the next check and unregisters future injection, but does not revoke relay-related host grants or disconnect background sessions. Manage/revoke site permissions through Chrome. No credentials are erased by hint preferences.

## Verification

Browser/cloud end-to-end tests have not been run. Verify optional site/all-site grants and denial, existing-tab injection, delayed WebMCP registration, zero tools, read-only preview, dismissal, missing relay setup, connection success/failure, different-target confirmation, permission revocation, and absence of credentials in the content response/DOM. The existing session engine remains authoritative. No relay deployment changes are included.
