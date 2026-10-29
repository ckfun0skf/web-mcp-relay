# Deploying the private relay

## Supported repository layouts

Both layouts use the same Worker implementation:

- Full repository: root package.json installs the relay npm workspace; root wrangler.jsonc uses relay/src/index.js.
- Standalone relay directory: relay/package.json and relay/wrangler.jsonc use src/index.js. The relay directory has no imports from extension/ or the repository root.

The two Wrangler configurations intentionally contain the same Worker name, binding and migration definitions. Keep those definitions synchronized when modifying infrastructure. They are alternative deployment entrypoints, not two Workers that must both be deployed.

## Deploy button

Full-repository deployment URL:

https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fckfun0skf%2Fweb-mcp-relay

The existing relay-subdirectory URL remains supported. Cloudflare should detect package.json, install dependencies and use the deploy script. Verify the wizard uses the intended directory. Neither deployment path is claimed to have passed live end-to-end testing yet.

Configure OWNER_SECRET using the deployment wizard when prompted, or add a Worker Secret afterward. Use 32-256 characters from A-Z, a-z, 0-9, underscore and hyphen. Never use the example placeholder or a Cloudflare API token. The root example covers full-repository deployment; relay/.dev.vars.example covers standalone deployment. Real values must never be committed.

## Build settings

For a full copy of this repository, set the build root to the repository root. Normally package detection installs dependencies automatically; if an explicit build command is needed, use npm install. Deploy with npm run deploy (or npx wrangler deploy).

For an older copied repository without the new root files, set the Cloudflare build root directory to relay. npm install and npx wrangler deploy must then execute inside that directory. Alternatively, with the root directory unchanged, set build command to npm install --prefix relay --workspaces=false and deploy command to cd relay && npx wrangler deploy. Do not combine these two directory approaches.

## Error: Could not detect a directory containing static files

If Wrangler runs at the full repository root without a Worker configuration there, it cannot locate relay/wrangler.jsonc and relay/package.json. The static-files error does not mean this project should deploy the extension as a static website. Correct the build root or add the root deployment entrypoints.

## Existing user copies

Updating the upstream repository does not update repositories already created by the deployment wizard. Apply the root-file patch to the destination copy, configure its build root to relay, or create a fresh deployment from the updated source. Preserve existing secrets and Durable Object resources. Check Worker-name alignment if Cloudflare renamed the Worker during creation.

## Verification

After deployment verify /health returns name web-mcp-relay and protocolVersion 1, a WebSocket upgrade without a valid OWNER_SECRET is rejected, and the extension can connect using the matching secret. Then verify MCP initialize/tools/list and native WebMCP list/call end to end. A successful build alone does not establish browser or MCP compatibility.
