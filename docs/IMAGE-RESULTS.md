# Browser PNG results

Relay runtime 0.2.1 can promote bounded PNG content from a browser tool result to actual MCP image content. Text/ordinary JSON results keep the existing representation. The active root wrangler.jsonc entry remains relay/src/index.js. No extension or Cloudflare configuration change is included.

## Supported shapes

- Direct {content:[{type:'image',mimeType:'image/png',data:'<base64>'}],metadata:...}
- Identity envelope {call_id,identity,workspace_id,result:{content:[...],metadata:...}}
- JSON strings or a single text-content JSON wrapper around these, with bounded decoding depth.

Image blocks are placed in the MCP result's top-level content array. Text and structuredContent retain identity/call/crop/scale metadata and an image placeholder/encoded length, not a second base64 copy. No external URL is fetched or image HTML rendered. Website result data remains untrusted.

## Limits

Existing incoming websocket frame limit 128000 characters, browser value limit 100000 and extension native result limit 64000 remain unchanged. Playground snapshots cap each image base64 at 48000 to fit that path. Relay accepts at most four images, eight total content blocks, 64000 base64 characters per image and 80000 combined; the extension's smaller full-result cap may reject results before the relay. PNG only: base64 structure, PNG signature, IHDR and dimensions (up to 4096 per edge, 16777216 pixels) are checked. This is header validation, not full PNG decoding or a guarantee about all image decoder behavior. Oversized/invalid results return a tool error; writes must not be automatically retried. Request a smaller crop for read-only snapshots.

## Deployment and manual verification

Commit publication is not a relay deployment. Update the Cloudflare Worker from this revision; /health should report version 0.2.1 and imageContent containing image/png. No direct cloud deployment is performed by this source change. Existing session/auth protocol and binding configuration are unchanged.

Refresh the Playground and the consumer's browser tool listing. Register/preserve the agent identity token, create a Paint workspace, call paint_wait_ready until ready, draw, then call paint_get_snapshot through call_browser_tool. Inspect the raw MCP response: it must include content entries of type image, not just base64 text. Verify source dimensions and scale/crop metadata before choosing drawing coordinates. The host and model must actually support image input. Receipt of image content is not proof that the model analyzed it correctly.

No automatic test workflow or browser/Cloudflare end-to-end verification is added or claimed in this commit.
