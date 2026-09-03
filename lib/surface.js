'use strict';

const fs = require('fs');
const path = require('path');

function loadPublishedSurface() {
  const file = path.join(__dirname, '..', 'published-surface.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function toolNames(surface) {
  return surface.tools.map((t) => t.name);
}

function extractReadmeToolNames(readmeText) {
  const names = new Set();
  const re = /`?(buddylists_[a-z0-9_]+)`?/g;
  let m;
  while ((m = re.exec(readmeText))) names.add(m[1]);
  return [...names].sort();
}

function diffNames(expected, actual) {
  const exp = new Set(expected);
  const act = new Set(actual);
  return {
    missing_on_wire: expected.filter((n) => !act.has(n)),
    extra_on_wire: actual.filter((n) => !exp.has(n)),
    missing_in_docs: actual.filter((n) => !exp.has(n)),
  };
}

const READ_TWINS = {
  buddylists_scoreboard: { path: '/api/roster', args: {} },
  buddylists_acceptable_use: { path: '/api/aup', args: {} },
  buddylists_quest: { path: '/api/quest', args: {} },
  buddylists_draft_rules: { path: '/api/org', args: {} },
  buddylists_business_days: { path: '/api/business-days?start_date=2026-09-02&add_business_days=1&calendars=US_FED', args: { start_date: '2026-09-02', add_business_days: 1, calendars: ['US_FED'] } },
};

const CONSENT_TOOL = 'buddylists_claim_founding_seat';

function renderToolsTable(surface) {
  const rows = [
    '| Tool | Proxies | Required args | Personal data? |',
    '|---|---|---|---|',
  ];
  for (const t of surface.tools) {
    const rest = t.rest || {};
    const proxy = `\`${rest.method || '?'} ${rest.path || '?'}\``;
    const req = (t.required && t.required.length) ? t.required.map((x) => `\`${x}\``).join(', ') : 'none';
    const pii = rest.pii || 'see schema';
    const mark = t.name === CONSENT_TOOL ? '🔴 ' : '';
    rows.push(`| ${mark}\`${t.name}\` — ${t.title || ''} | ${proxy} | ${req} | ${pii} |`);
  }
  return rows.join('\n');
}

module.exports = {
  loadPublishedSurface,
  toolNames,
  extractReadmeToolNames,
  diffNames,
  READ_TWINS,
  CONSENT_TOOL,
  renderToolsTable,
};
