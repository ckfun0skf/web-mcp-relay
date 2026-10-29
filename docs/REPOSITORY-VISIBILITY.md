# Repository cloning and visibility

## Setup guide

1. Sign in to Cloudflare and connect GitHub or GitLab.
2. Clone a public repository via Git URL. If prompted for the source URL, enter https://github.com/ckfun0skf/web-mcp-relay.git. The deployment flow creates a copy in your account; no local git clone command is required.
3. Optional: make the new copy private if you prefer and your account or organization permits it. If setup offers a visibility selector, choose Private. This guide does not assume that every deployment wizard exposes that selector.

For a GitHub copy, you can change visibility after creation through repository Settings > General > Danger Zone > Change repository visibility > Make private. Follow GitHub's confirmation prompts. For GitLab, use the destination project's visibility controls subject to its policies; the GitHub-specific path above does not apply.

The public source and the user's destination copy are different repositories. The source must remain public for others to use the Deploy to Cloudflare button. A private destination does not mean the source can be private. This guide describes an independently cloned copy, not an assumption that a public fork can always be converted to private.

Keep the Cloudflare GitHub/GitLab integration authorized for the destination repository. If a repository disappears from Cloudflare or builds cannot clone it after changing visibility, review the integration's repository access and reconnect as necessary. Validate the next build before relying on automatic deployment. The complete private-copy deployment flow has not been end-to-end tested by this project.

Private repository visibility controls source access, not the deployed Worker URL. It does not replace relay authentication, OWNER_SECRET, session capabilities, local execution approval or secret hygiene. Never commit live credentials even in a private repository.

## References

- https://developers.cloudflare.com/workers/platform/deploy-buttons/
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility
