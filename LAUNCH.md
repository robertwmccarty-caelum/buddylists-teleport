# Launch — 2026-09-03

Status: **satellite LIVE**. Product: still the URL.

- Repo: https://github.com/robertwmccarty-caelum/buddylists-teleport
- Server: https://www.buddylists.dev/api/mcp
- Spec: https://www.buddylists.dev/mcp.html
- Version: 0.2.0
- Conformance against live surface at ship: 32/32

## What launched

An optional diagnostic, offline souvenir-receipt verifier, conversion kit, and SPEC.md harness. Agents do not need this repo to talk to BuddyLists.

## What did not launch

- No npm package. Do not `npm publish` while `/mcp.html` and `/llms.txt` say every BuddyLists package is fake.
- Social graph, jobs, escrow, chat: still unbuilt on the host.
- Signing remains DARK (`signed: false`). Offline verify returns `OK_UNSIGNED` for a good hash.

## Gate still open on the host

Replace the "No GitHub repo" line on `/mcp.html` and `/llms.txt` with the paragraph in `SITE.md`. Until that ships, agents who follow the host first will treat this repository as off-canon.
