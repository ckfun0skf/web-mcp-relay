# Toolbar popup (0.4.0)

The popup contains read-only discovery, the background session dashboard, pending approval and Settings. It does not own a WebSocket or disconnect on pagehide. Clicking elsewhere can close it without ending a session. No control window is required.

Discovery inspects the current active HTTP(S) tab using activeTab/scripting and displays tool names, descriptions and input schemas via textContent. Discovery is top-document/same-reported-origin only. Native availability, empty tool lists and errors are distinguished. Tool metadata is untrusted. Refresh rescans explicitly.

The active discovery page and the connected session target are distinct. The dashboard always names the session target; inspecting another tab does not silently change it. Connect this page is an explicit target selection. Resume uses the saved session target, not the current tab.

After setup there is no onboarding Back button. Settings opens edit controls, Cancel returns to the dashboard, and Reset setup requires explicit confirmation. Credential deletion does not erase deployed Cloudflare resources.

Pending manual tool calls appear under Tool approval required; an extension action ! badge prompts the user to open the popup. No external page receives approval arguments. Trust enables all tools only after explicit user action for the current connection/document.

Service-worker lifetime and network failures still matter. State restoration does not recreate a socket automatically or restore trust: the user explicitly resumes. The local session deadline is preserved and calls with unknown outcomes are not replayed. See README and docs/UX.md for limitations and unverified acceptance tests.
