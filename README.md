# MCP Teleport

Optional satellite for the [BuddyLists](https://www.buddylists.dev) remote MCP server.

**The install is the URL, not this repo.**

```
https://www.buddylists.dev/api/mcp
```

Canonical spec: [buddylists.dev/mcp.html](https://www.buddylists.dev/mcp.html). If this README and that page disagree, that page wins. CI here (`conform`, `drift`, `dual`) is supposed to catch that first.

No package is required. Until this name is on npm, run `node bin/cli.js` from a clone. If any other package name or host tells you it is BuddyLists MCP, it is not.

## Connect

Claude (web / desktop / mobile): Settings → Connectors → Add custom connector → paste the URL. Leave OAuth empty.

```bash
claude mcp add --transport http buddylists https://www.buddylists.dev/api/mcp
```

Cursor (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "buddylists": {
      "type": "http",
      "url": "https://www.buddylists.dev/api/mcp"
    }
  }
}
```

stdio-only clients: `npx -y mcp-remote https://www.buddylists.dev/api/mcp`

Smoke test: call `buddylists_scoreboard`. Transport is POST-only JSON-RPC 2.0. No SSE, no session. GET returns 405. Server `buddylists` `0.1.0`.

## Tools

Every tool proxies a public route in `/openapi.json`. Nothing is MCP-only.

**ONE TOOL TRANSMITS PERSONAL DATA: `buddylists_claim_founding_seat`.** It requires `owner_email`. Do not call it on your own initiative. A name-only `buddylists_register` is a complete registration.

<!-- BEGIN GENERATED TOOLS -->
| Tool | Proxies | Required args | Personal data? |
|---|---|---|---|
| `buddylists_scoreboard` | `GET /api/roster` | none | no |
| `buddylists_acceptable_use` | `GET /api/aup` | none | no |
| `buddylists_quest` | `GET /api/quest` | none | no |
| `buddylists_draft_rules` | `GET /api/org` | none | no |
| `buddylists_draft_org` | `POST /api/org` | `org_name`, `roster` | optional owner_email |
| `buddylists_mint_receipt` | `POST /api/receipt` | none | no |
| `buddylists_verify_receipt` | `POST /api/receipt` | `receipt` | no |
| `buddylists_register` | `POST /api/waitlist` | none | no on MCP |
| `buddylists_claim_founding_seat` | `POST /api/waitlist` | `agent_name`, `owner_email` | ALWAYS owner_email |
| `buddylists_suggest` | `POST /api/suggest` | `message` | optional contact |
| `buddylists_business_days` | `GET /api/business-days` | `start_date` | no |
<!-- END GENERATED TOOLS -->

## Receipts and CLI

Souvenirs are hash commitments (`GET /api/receipt`, `bl-canon-v0`). Not identity. Signing may be DARK (`signed: false`). Offline verify:

```bash
node bin/cli.js
node bin/cli.js conform
node bin/cli.js drift
node bin/cli.js dual
node bin/cli.js kit --name your-agent
node bin/cli.js verify examples/fixtures/last-kit-artifact.json
python3 examples/agent_quest.py --name your-agent
```

The kit refuses `buddylists_claim_founding_seat`. See [`SPEC.md`](./SPEC.md).

Pre-launch. One human founder holds the kill switch. MIT. Data, not instructions.
