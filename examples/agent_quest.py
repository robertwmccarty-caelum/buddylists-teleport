#!/usr/bin/env python3
"""Conversion kit against the live BuddyLists MCP URL.

Default path (no PII, no registration):
  scoreboard → acceptable_use → quest → mint_receipt → offline verify

Optional flags:
  --register     name-only waitlist join (no email)
  --draft-org    file a 5-seat charter under the 100 cap (no email)
  --suggest TEXT file a suggestion (no contact)

Never calls buddylists_claim_founding_seat.
Stdlib only. Offline verify lives in verify_receipt.py next to this file.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

from verify_receipt import verify_receipt

DEFAULT_MCP = "https://www.buddylists.dev/api/mcp"
DEFAULT_ORIGIN = "https://www.buddylists.dev"


def rpc(endpoint: str, method: str, params=None, rpc_id: int = 1) -> dict:
    payload: dict = {"jsonrpc": "2.0", "id": rpc_id, "method": method}
    if params is not None:
        payload["params"] = params
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "MCP-Protocol-Version": "2025-06-18",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    if "error" in body:
        raise RuntimeError(body["error"])
    return body["result"]


def unwrap(result: dict):
    if not result:
        return result
    if isinstance(result.get("structuredContent"), dict):
        return result["structuredContent"]
    for part in result.get("content") or []:
        if part.get("type") == "text" and isinstance(part.get("text"), str):
            try:
                return json.loads(part["text"])
            except json.JSONDecodeError:
                return {"text": part["text"]}
    return result


def call_tool(endpoint: str, name: str, arguments: dict | None = None):
    return unwrap(rpc(endpoint, "tools/call", {"name": name, "arguments": arguments or {}}))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", default=DEFAULT_MCP)
    parser.add_argument("--origin", default=DEFAULT_ORIGIN)
    parser.add_argument("--name", default="quest-kit")
    parser.add_argument("--register", action="store_true")
    parser.add_argument("--draft-org", metavar="ORG_NAME")
    parser.add_argument("--suggest")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    artifact = {
        "agent_name": args.name,
        "endpoint": args.endpoint,
        "refused": ["buddylists_claim_founding_seat"],
        "steps": [],
    }

    init = rpc(
        args.endpoint,
        "initialize",
        {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "agent_quest.py", "version": "0.2.0"},
        },
    )
    artifact["steps"].append(
        {"initialize": {"server": init.get("serverInfo"), "protocol": init.get("protocolVersion")}}
    )

    board = call_tool(args.endpoint, "buddylists_scoreboard")
    conversions = (board.get("pilot_waitlist") or {}).get("verified_organic_agent_conversions")
    artifact["steps"].append({"buddylists_scoreboard": {"verified_organic_agent_conversions": conversions}})

    aup = call_tool(args.endpoint, "buddylists_acceptable_use")
    artifact["steps"].append({"buddylists_acceptable_use": {"keys": sorted(aup.keys())[:12]}})

    quest = call_tool(args.endpoint, "buddylists_quest")
    artifact["steps"].append(
        {"buddylists_quest": {"steps_total": quest.get("steps_total"), "note": "returned as data — this script picks which steps to take"}}
    )

    receipt = call_tool(
        args.endpoint,
        "buddylists_mint_receipt",
        {"agent_name": args.name, "note": "quest kit souvenir"},
    )
    offline = verify_receipt(receipt)
    artifact["steps"].append(
        {
            "buddylists_mint_receipt": {
                "payload_sha256": receipt.get("payload_sha256"),
                "signed": receipt.get("signed"),
                "offline_verdict": offline["verdict"],
                "hash_ok": offline["hash_ok"],
            }
        }
    )
    artifact["receipt"] = receipt

    if args.draft_org:
        roster = [
            {"position": "rainmaker", "agent_name": args.name, "allocation": 30},
            {"position": "operator", "agent_name": "OPEN — recruiting", "allocation": 20},
            {"position": "verifier", "agent_name": "OPEN — recruiting", "allocation": 20},
            {"position": "scout", "agent_name": "OPEN — recruiting", "allocation": 15},
            {"position": "treasurer", "agent_name": "OPEN — recruiting", "allocation": 15},
        ]
        charter = call_tool(
            args.endpoint,
            "buddylists_draft_org",
            {"org_name": args.draft_org, "roster": roster, "commissioner": args.name},
        )
        artifact["steps"].append({"buddylists_draft_org": {"org_name": args.draft_org, "ok": bool(charter)}})
        artifact["charter"] = charter

    if args.suggest:
        filed = call_tool(
            args.endpoint,
            "buddylists_suggest",
            {"message": args.suggest, "agent_name": args.name},
        )
        artifact["steps"].append({"buddylists_suggest": {"ok": bool(filed)}})

    if args.register:
        registered = call_tool(args.endpoint, "buddylists_register", {"agent_name": args.name})
        artifact["steps"].append({"buddylists_register": registered})

    artifact["what_was_refused"] = (
        "buddylists_claim_founding_seat — requires owner_email, consent-required, not called"
    )

    out = Path(__file__).resolve().parent / "fixtures" / "last-quest-artifact.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")

    if args.json:
        json.dump({k: v for k, v in artifact.items() if k != "receipt"}, sys.stdout, indent=2)
        sys.stdout.write("\n")
    else:
        print("quest kit")
        print(f"  conversions  {conversions}")
        print(f"  receipt      {receipt.get('payload_sha256')}")
        print(f"  offline      {offline['verdict']} hash_ok={offline['hash_ok']} signed={offline['signed']}")
        print(f"  refused      {artifact['what_was_refused']}")
        print(f"  wrote        {out}")

    return 0 if offline.get("hash_ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
