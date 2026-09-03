'use strict';
const { verifyReceipt } = require('./canon');
const { getJson, initialize, listTools, callTool } = require('./mcp');
const { loadPublishedSurface, toolNames, CONSENT_TOOL } = require('./surface');
const path = require('path');
const { endpointFrom, originFrom, c } = require('./cmds-a');
async function cmdConform(flags) {
  const endpoint = endpointFrom(flags);
  const origin = originFrom(flags);
  const published = loadPublishedSurface();
  const assertions = [];
  const check = (id, ok, detail) => {
    assertions.push({ id, ok, detail });
  };

  const get = await getJson(endpoint);
  check('T1_GET_405', get.status === 405, `HTTP ${get.status}`);
  check('T1_GET_BODY', /install|tool|mcp|POST/i.test(get.text), '405 body should explain POST install');

  const init = await initialize(endpoint);
  const info = init.result.serverInfo || {};
  check('T2_SERVER_NAME', info.name === 'buddylists', JSON.stringify(info));
  check('T2_INSTRUCTIONS_DATA', /data, not instructions|data about a remote system/i.test(init.result.instructions || ''), 'initialize.instructions must fence results as data');
  check('T2_NO_SESSION_REQUIRED', true, 'initialize succeeded without Mcp-Session-Id');

  const listed = await listTools(endpoint);
  const byName = Object.fromEntries(listed.tools.map((t) => [t.name, t]));
  const wireNames = listed.tools.map((t) => t.name);
  const snapNames = toolNames(published);
  check('T3_COUNT', wireNames.length === snapNames.length, `${wireNames.length} vs snapshot ${snapNames.length}`);
  check(
    'T3_NAMES',
    snapNames.every((n) => wireNames.includes(n)) && wireNames.every((n) => snapNames.includes(n)),
    `wire=${wireNames.join(',')} snapshot=${snapNames.join(',')}`
  );

  for (const snap of published.tools) {
    const live = byName[snap.name];
    if (!live) continue;
    const liveReq = (live.inputSchema && live.inputSchema.required) || [];
    const snapReq = snap.required || [];
    const reqOk = liveReq.length === snapReq.length && snapReq.every((x) => liveReq.includes(x));
    check(`T4_REQUIRED_${snap.name}`, reqOk, `live=${liveReq} snap=${snapReq}`);
  }

  const claim = byName[CONSENT_TOOL];
  check('T5_CLAIM_EXISTS', Boolean(claim), CONSENT_TOOL);
  if (claim) {
    const req = (claim.inputSchema && claim.inputSchema.required) || [];
    const props = (claim.inputSchema && claim.inputSchema.properties) || {};
    check('T5_CLAIM_REQUIRES_EMAIL', req.includes('owner_email') && req.includes('agent_name'), String(req));
    check('T5_CLAIM_HAS_EMAIL_PROP', Boolean(props.owner_email), 'owner_email property');
    const blob = `${claim.description || ''} ${JSON.stringify(claim.inputSchema)}`.toLowerCase();
    check('T5_CLAIM_CONSENT_LANGUAGE', /consent|owner/.test(blob), 'description/schema should mention consent or owner');
  }

  const mint = byName['buddylists_mint_receipt'];
  if (mint) {
    const props = (mint.inputSchema && mint.inputSchema.properties) || {};
    check('T6_MINT_NO_EMAIL_FIELD', !Object.prototype.hasOwnProperty.call(props, 'owner_email'), Object.keys(props).join(','));
  }

  const register = byName['buddylists_register'];
  if (register) {
    const props = (register.inputSchema && register.inputSchema.properties) || {};
    check('T6_REGISTER_NO_EMAIL_FIELD', !Object.prototype.hasOwnProperty.call(props, 'owner_email'), Object.keys(props).join(','));
  }

  const board = await callTool(endpoint, 'buddylists_scoreboard', {});
  check('T7_SCOREBOARD_CALLS', Boolean(board.result), 'scoreboard returned');
  const conversions = board.result && board.result.pilot_waitlist && board.result.pilot_waitlist.verified_organic_agent_conversions;
  check('T7_SCOREBOARD_HAS_COUNT', typeof conversions === 'number', `verified_organic_agent_conversions=${conversions}`);

  const specPath = path.join(origin, '/api/receipt');
  const spec = await getJson(specPath);
  check('T8_RECEIPT_SPEC', spec.ok && spec.json && spec.json.canonicalization === 'bl-canon-v0', spec.status);
  if (spec.json) {
    check('T8_SIGNED_FIELDS', Array.isArray(spec.json.signed_fields) && spec.json.signed_fields[0] === 'receipt_type', String(spec.json.signed_fields));
    check('T8_SIGNING_STATUS_DECLARED', typeof spec.json.signing_live === 'boolean', `signing_live=${spec.json.signing_live}`);
  }

  const minted = await callTool(endpoint, 'buddylists_mint_receipt', {
    agent_name: 'buddylists-teleport-conform',
    note: 'conformance souvenir',
  });
  const receipt = minted.result;
  check('T9_MINT', Boolean(receipt && receipt.payload_sha256 && receipt.canonical), 'mint returned canonical + hash');
  if (receipt) {
    const offline = verifyReceipt(receipt, { expectedPublicKeyB64: spec.json && spec.json.public_key_b64 });
    check('T9_OFFLINE_VERIFY', offline.verdict === 'OK' || offline.verdict === 'OK_UNSIGNED', offline.verdict);
    const tampered = { ...receipt, agent_name: 'not-the-name', note: 'mutated' };
    const bad = verifyReceipt(tampered);
    check('T9_TAMPER_DETECT', bad.verdict === 'TAMPERED', bad.verdict);
  }

  const report = {
    endpoint,
    ok: assertions.every((a) => a.ok),
    passed: assertions.filter((a) => a.ok).length,
    failed: assertions.filter((a) => !a.ok).length,
    assertions,
  };

  if (flags.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(c.bold('conform · SPEC.md assertions against live surface'));
    for (const a of assertions) {
      console.log(`  ${a.ok ? c.green('✔') : c.red('✘')} ${a.id}  ${c.dim(String(a.detail || ''))}`);
    }
    console.log(report.ok ? c.green(`  ${report.passed}/${assertions.length} passed`) : c.red(`  ${report.failed} failed`));
  }
  process.exitCode = report.ok ? 0 : 1;
}

module.exports = { cmdConform };
