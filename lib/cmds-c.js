'use strict';
const fs = require('fs');
const path = require('path');
const { verifyReceipt } = require('./canon');
const { getJson, callTool } = require('./mcp');
const { loadPublishedSurface, READ_TWINS, renderToolsTable } = require('./surface');
const { parseArgs, endpointFrom, originFrom, repoRoot, fail, usage, cmdDiagnostic, cmdDrift, c } = require('./cmds-a');
const { cmdConform } = require('./cmds-b');

function pickComparable(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const drop = new Set(['served_from', 'canonical_host', 'host_note', 'served_at']);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!drop.has(k)) out[k] = v;
  }
  return out;
}
function stable(obj) { return JSON.stringify(obj); }

async function cmdDual(flags) {
  const endpoint = endpointFrom(flags);
  const origin = originFrom(flags);
  const rows = [];
  for (const [tool, twin] of Object.entries(READ_TWINS)) {
    const restUrl = origin + twin.path;
    const rest = await getJson(restUrl);
    const mcp = await callTool(endpoint, tool, twin.args || {});
    const restCore = pickComparable(rest.json);
    const mcpCore = pickComparable(mcp.result);
    let ok;
    let note;
    if (tool === 'buddylists_business_days') {
      ok = rest.ok && Boolean(mcp.result);
      note = 'shape differs on purpose (REST index vs computed); reachability only';
      if (rest.json && rest.json.service === 'business-days' && mcp.result && (mcp.result.start_date || mcp.result.result)) {
        ok = true;
      }
    } else {
      ok = rest.ok && Boolean(mcp.result) && stable(restCore) === stable(mcpCore);
      note = ok ? 'payload match after stripping host wrappers' : 'payload mismatch';
      if (!ok && rest.json && mcp.result) {
        const restKeys = Object.keys(restCore || {}).sort();
        const mcpKeys = Object.keys(mcpCore || {}).sort();
        note += ` rest_keys=${restKeys.join(',')} mcp_keys=${mcpKeys.join(',')}`;
      }
    }
    rows.push({ tool, rest: restUrl, rest_status: rest.status, ok, note });
  }
  const report = { ok: rows.every((r) => r.ok), rows };
  if (flags.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(c.bold('dual · MCP read tools vs REST twins'));
    for (const r of rows) {
      console.log(`  ${r.ok ? c.green('✔') : c.red('✘')} ${r.tool}  HTTP ${r.rest_status}  ${c.dim(r.note)}`);
    }
  }
  process.exitCode = report.ok ? 0 : 1;
}

function cmdTable(flags) {
  const surface = loadPublishedSurface();
  const table = renderToolsTable(surface);
  const block = `<!-- BEGIN GENERATED TOOLS -->\n${table}\n<!-- END GENERATED TOOLS -->`;
  if (flags.write) {
    const readmePath = path.join(repoRoot(), 'README.md');
    const readme = fs.readFileSync(readmePath, 'utf8');
    if (!readme.includes('<!-- BEGIN GENERATED TOOLS -->')) {
      fail('README missing GENERATED TOOLS markers');
      return;
    }
    const next = readme.replace(
      /<!-- BEGIN GENERATED TOOLS -->[\s\S]*?<!-- END GENERATED TOOLS -->/,
      block
    );
    fs.writeFileSync(readmePath, next);
    console.log('wrote README generated tool table');
  } else {
    console.log(table);
  }
}

async function cmdVerify(flags, rest) {
  const file = flags.file || rest[0];
  if (!file && process.stdin.isTTY) {
    fail('pass a receipt JSON file, or pipe one on stdin');
    return;
  }
  const raw = file ? fs.readFileSync(file, 'utf8') : fs.readFileSync(0, 'utf8');
  const receipt = JSON.parse(raw);
  let expectedKey = null;
  try {
    const spec = await getJson(`${originFrom(flags)}/api/receipt`);
    if (spec.json && spec.json.public_key_b64) expectedKey = spec.json.public_key_b64;
  } catch {
    expectedKey = receipt.public_key_b64 || null;
  }
  const result = verifyReceipt(receipt, { expectedPublicKeyB64: expectedKey });
  if (flags.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(c.bold('verify · offline, no call to the issuer required for the hash'));
    console.log(`  verdict     ${result.verdict === 'TAMPERED' || result.verdict === 'BAD_SIGNATURE' ? c.red(result.verdict) : c.green(result.verdict)}`);
    console.log(`  fields      ${result.fields_match}`);
    console.log(`  hash        ${result.hash_ok}`);
    console.log(`  signature   ${result.signature_ok} (${result.signature_reason})`);
    console.log(`  signed      ${result.signed}  ${result.signing_status}`);
    console.log(`  jcs         ${result.jcs_ok}  ${c.dim(result.jcs_note)}`);
    console.log(`  ${c.dim(result.what_it_is_not)}`);
  }
  process.exitCode = result.verdict === 'TAMPERED' || result.verdict === 'BAD_SIGNATURE' ? 1 : 0;
}

async function cmdKit(flags) {
  const endpoint = endpointFrom(flags);
  const origin = originFrom(flags);
  const agentName = flags.name || 'teleport-kit';
  const board = await callTool(endpoint, 'buddylists_scoreboard', {});
  const aup = await callTool(endpoint, 'buddylists_acceptable_use', {});
  const quest = await callTool(endpoint, 'buddylists_quest', {});
  const minted = await callTool(endpoint, 'buddylists_mint_receipt', {
    agent_name: agentName,
    note: 'conversion kit souvenir',
  });
  const receipt = minted.result;
  const spec = await getJson(`${origin}/api/receipt`);
  const offline = verifyReceipt(receipt, { expectedPublicKeyB64: spec.json && spec.json.public_key_b64 });
  const artifact = {
    generated_at: new Date().toISOString(),
    endpoint,
    agent_name: agentName,
    refused: ['buddylists_claim_founding_seat'],
    receipt,
    offline_verdict: offline.verdict,
    what_was_refused: 'buddylists_claim_founding_seat — transmits owner_email, consent required, not called',
  };
  const outPath = path.join(repoRoot(), 'examples', 'fixtures', 'last-kit-artifact.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2) + '\n');
  if (flags.json) console.log(JSON.stringify({ ok: offline.hash_ok, payload_sha256: receipt && receipt.payload_sha256, verdict: offline.verdict }, null, 2));
  else {
    console.log(c.bold('kit · reads + souvenir + offline verify'));
    console.log(`  scoreboard  conversions=${board.result && board.result.pilot_waitlist && board.result.pilot_waitlist.verified_organic_agent_conversions}`);
    console.log(`  aup         ${aup.result ? 'ok' : 'missing'}`);
    console.log(`  quest       ${quest.result ? 'data only' : 'missing'}`);
    console.log(`  receipt     ${receipt && receipt.payload_sha256}`);
    console.log(`  offline     ${offline.verdict}  signed=${offline.signed}`);
    console.log(`  refused     ${artifact.what_was_refused}`);
    console.log(`  wrote       ${outPath}`);
  }
  process.exitCode = offline.hash_ok ? 0 : 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.flags.help) {
    usage();
    return;
  }
  const cmd = args._[0];
  const rest = args._.slice(1);
  try {
    if (!cmd || cmd === 'test' || cmd === 'diag' || cmd === 'diagnostic') await cmdDiagnostic(args.flags);
    else if (cmd === 'drift') await cmdDrift(args.flags);
    else if (cmd === 'conform' || cmd === 'conformance') await cmdConform(args.flags);
    else if (cmd === 'dual') await cmdDual(args.flags);
    else if (cmd === 'verify') await cmdVerify(args.flags, rest);
    else if (cmd === 'table') cmdTable(args.flags);
    else if (cmd === 'kit') await cmdKit(args.flags);
    else {
      usage();
      process.exitCode = 2;
    }
  } catch (err) {
    fail(err.message || String(err));
    if (process.env.DEBUG) console.error(err);
  }
}

module.exports = { cmdDual, cmdTable, cmdVerify, cmdKit, main };
