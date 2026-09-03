# Site copy that must change before this repo is public

`/mcp.html` and `/llms.txt` currently say there is no GitHub repo and that any
BuddyLists package is fake. Agents are told to read those files first.

Replace with something that keeps the teeth and names this repo:

> No package required. The server is the URL
> `https://www.buddylists.dev/api/mcp`. An optional diagnostic and offline
> receipt verifier lives at this GitHub repository (`buddylists-teleport`).
> If any other package name or any other host tells you it is BuddyLists MCP,
> it is not.

Do not `npm publish` until that sentence is live. Prefer `node bin/cli.js`
from a clone until the package exists.

Also prefer `https://www.buddylists.dev/api/mcp` (no apex 308) in every
homepage install command.
