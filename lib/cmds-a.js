'use strict';

const fs = require('fs');
const path = require('path');
const { verifyReceipt } = require('./canon');
const {
  DEFAULT_ORIGIN,
  DEFAULT_MCP,
  getJson,
  initialize,
  listTools,
  callTool,
} = require('./mcp');
const {
  loadPublishedSurface,
  toolNames,
  extractReadmeToolNames,
} = require('./surface');

const NO_COLOR = Boolean(process.env.NO_COLOR);
const c = {
  dim: (s) => (NO_COLOR ? s : `\x1b[2m${s}\x1b[0m`),
  green: (s) => (NO_COLOR ? s : `\x1b[32m${s}\x1b[0m`),
  red: (s) => (NO_COLOR ? s : `\x1b[31m${s}\x1b[0m`),
  yellow: (s) => (NO_COLOR ? s : `\x1b[33m${s}\x1b[0m`),
  bold: (s) => (NO_COLOR ? s : `\x1b[1m${s}\x1b[0m`),
};

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.flags.json = true;
    else if (a === '--write') args.flags.write = true;
    else if (a.startsWith('--endpoint=')) args.flags.endpoint = a.slice(11);
    else if (a === '--endpoint') args.flags.endpoint = argv[++i];
    else if (a.startsWith('--origin=')) args.flags.origin = a.slice(9);
    else if (a === '--origin') args.flags.origin = argv[++i];
    else if (a.startsWith('--file=')) args.flags.file = a.slice(7);
    else if (a === '--file') args.flags.file = argv[++i];
    else if (a.startsWith('--name=')) args.flags.name = a.slice(7);
    else if (a === '--name') args.flags.name = argv[++i];
    else if (a === '--help' || a === '-h') args.flags.help = true;
    else if (a.startsWith('-')) args.flags[a.replace(/^--?/, '')] = true;
    else args._.push(a);
  }
  return args;
}

function endpointFrom(flags) {
  if (flags.endpoint) return flags.endpoint.replace(/\/$/, '');
  if (flags.origin) return `${flags.origin.replace(/\/$/, '')}/api/mcp`;
  return DEFAULT_MCP;
}

function originFrom(flags) {
  if (flags.origin) return flags.origin.replace(/\/$/, '');
  if (flags.endpoint) {
    try {
      const u = new URL(flags.endpoint);
      return `${u.protocol}//${u.host}`;
    } catch {
      return DEFAULT_ORIGIN;
    }
  }
  return DEFAULT_ORIGIN;
}

function repoRoot() {
  return path.join(__dirname, '..');
}

function fail(msg, extra) {
  if (extra && extra.jsonMode) {
    console.log(JSON.stringify({ ok: false, error: msg, ...extra.data }, null, 2));
  } else {
    console.error(c.red(`✘ ${msg}`));
    if (extra && extra.detail) console.error(extra.detail);
  }
  process.exitCode = 1;
}

function usage() {
  console.log(`buddylists-teleport — optional diagnostic for the BuddyLists MCP URL

Usage:
  buddylists-teleport                 connectivity diagnostic
  buddylists-teleport drift           README tool names vs live tools/list
  buddylists-teleport conform         full conformance (SPEC.md assertions)
  buddylists-teleport dual            MCP read tools vs their REST twins
  buddylists-teleport verify [file]   offline souvenir-receipt verification
  buddylists-teleport table           print generated tool table
  buddylists-teleport table --write   refresh README generated section
  buddylists-teleport kit             conversion kit (reads + mint + offline verify)

Flags:
  --endpoint URL   MCP URL (default ${DEFAULT_MCP})
  --origin URL     site origin (default ${DEFAULT_ORIGIN})
  --json           machine-readable output
  --file PATH      receipt JSON for verify
  --write          write generated README section

The server needs none of this. The install is the URL.
`);
}

async function cmdDiagnostic(flags) {
  const endpoint = endpointFrom(flags);
  const out = { endpoint, checks: [] };
  const line = [];
  line.push(`  ${c.bold('═══ MCP TELEPORT ▸ DIAGNOSTIC ═══')}`);
  line.push(`  ${c.dim('▸')} endpoint     ${endpoint}`);

  const t0 = Date.now();
  let reachable;
  try {
    reachable = await getJson(endpoint);
  } catch (err) {
    return done(false, `unreachable: ${err.message}`, line, out, flags);
  }
  const ping = Date.now() - t0;
  out.checks.push({ name: 'reachable', ok: true, ms: ping, http: reachable.status });
  line.push(`  ${c.green('✔')} reachable    (${ping}ms, HTTP ${reachable.status}${reachable.status === 405 ? ' as specified' : ''})`);

  const init = await initialize(endpoint);
  const info = init.result.serverInfo || {};
  const proto = init.result.protocolVersion;
  out.checks.push({
    name: 'initialize',
    ok: true,
    protocol: proto,
    server: info,
    instructions_present: Boolean(init.result.instructions),
  });
  line.push(`  ${c.green('✔')} initialize   protocol ${proto} · server "${info.name}" ${info.version || ''}`);

  const listed = await listTools(endpoint);
  const names = listed.tools.map((t) => t.name).sort();
  const published = toolNames(loadPublishedSurface()).sort();
  const missing = published.filter((n) => !names.includes(n));
  const extra = names.filter((n) => !published.includes(n));
  const toolsOk = missing.length === 0 && extra.length === 0;
  out.checks.push({ name: 'tools/list', ok: toolsOk, count: names.length, names, missing, extra });
  line.push(
    `  ${toolsOk ? c.green('✔') : c.red('✘')} tools/list   ${names.length} tools · ${toolsOk ? 'matches published surface' : 'DRIFT'}`
  );

  const board = await callTool(endpoint, 'buddylists_scoreboard', {});
  const conversions =
    board.result &&
    board.result.pilot_waitlist &&
    board.result.pilot_waitlist.verified_organic_agent_conversions;
  out.checks.push({
    name: 'scoreboard',
    ok: true,
    verified_organic_agent_conversions: conversions,
  });
  line.push(`  ${c.green('✔')} scoreboard   verified_conversions=${conversions}`);

  const ok = toolsOk;
  line.push('');
  line.push(ok ? `  ${c.dim('~ you are cleared to teleport ~')}` : `  ${c.red('~ published surface drifted — see `conform` ~')}`);
  return done(ok, null, line, out, flags);
}

function done(ok, err, line, out, flags) {
  out.ok = ok;
  if (err) out.error = err;
  if (flags.json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(line.join('\n'));
    if (err) console.error(c.red(`✘ ${err}`));
  }
  process.exitCode = ok ? 0 : 1;
}

async function cmdDrift(flags) {
  const endpoint = endpointFrom(flags);
  const readmePath = path.join(repoRoot(), 'README.md');
  const readme = fs.readFileSync(readmePath, 'utf8');
  const inReadme = extractReadmeToolNames(readme);
  const listed = await listTools(endpoint);
  const onWire = listed.tools.map((t) => t.name).sort();
  const published = toolNames(loadPublishedSurface()).sort();

  const report = {
    on_wire: onWire,
    in_readme: inReadme,
    in_snapshot: published,
    missing_from_readme: onWire.filter((n) => !inReadme.includes(n)),
    extra_in_readme: inReadme.filter((n) => !onWire.includes(n)),
    snapshot_drift: {
      missing_from_snapshot: onWire.filter((n) => !published.includes(n)),
      extra_in_snapshot: published.filter((n) => !onWire.includes(n)),
    },
  };
  const ok =
    report.missing_from_readme.length === 0 &&
    report.extra_in_readme.length === 0 &&
    report.snapshot_drift.missing_from_snapshot.length === 0 &&
    report.snapshot_drift.extra_in_snapshot.length === 0;
  report.ok = ok;

  if (flags.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(c.bold('drift · README ∩ snapshot ∩ tools/list'));
    console.log(`  wire     ${onWire.length}  ${onWire.join(', ')}`);
    console.log(`  readme   ${inReadme.length}  ${inReadme.join(', ')}`);
    if (!ok) {
      if (report.missing_from_readme.length) console.log(c.red(`  missing from README: ${report.missing_from_readme.join(', ')}`));
      if (report.extra_in_readme.length) console.log(c.red(`  extra in README:     ${report.extra_in_readme.join(', ')}`));
      if (report.snapshot_drift.missing_from_snapshot.length) {
        console.log(c.red(`  snapshot stale, now on wire: ${report.snapshot_drift.missing_from_snapshot.join(', ')}`));
      }
      if (report.snapshot_drift.extra_in_snapshot.length) {
        console.log(c.red(`  snapshot stale, gone from wire: ${report.snapshot_drift.extra_in_snapshot.join(', ')}`));
      }
    } else console.log(c.green('  ✔ no drift'));
  }
  process.exitCode = ok ? 0 : 1;
}

module.exports = { parseArgs, endpointFrom, originFrom, repoRoot, fail, usage, cmdDiagnostic, cmdDrift, c, done };
