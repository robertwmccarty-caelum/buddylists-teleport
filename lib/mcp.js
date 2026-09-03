'use strict';

const DEFAULT_ORIGIN = 'https://www.buddylists.dev';
const DEFAULT_MCP = `${DEFAULT_ORIGIN}/api/mcp`;

function headers() {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'MCP-Protocol-Version': '2025-06-18',
  };
}

async function postJson(url, body, extraHeaders = {}) {
  const started = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...headers(), ...extraHeaders },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const ms = Date.now() - started;
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, headers: res.headers, text, json, ms };
}

async function getJson(url) {
  const started = Date.now();
  const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  const text = await res.text();
  const ms = Date.now() - started;
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, headers: res.headers, text, json, ms };
}

async function mcpRpc(endpoint, method, params, id = 1) {
  const payload = { jsonrpc: '2.0', id, method };
  if (params !== undefined) payload.params = params;
  const res = await postJson(endpoint, payload);
  if (!res.json) {
    throw new Error(`MCP ${method}: non-JSON response HTTP ${res.status}: ${res.text.slice(0, 200)}`);
  }
  if (res.json.error) {
    const err = res.json.error;
    throw new Error(`MCP ${method}: ${err.code || ''} ${err.message || JSON.stringify(err)}`);
  }
  return { result: res.json.result, raw: res.json, status: res.status, ms: res.ms, headers: res.headers };
}

function unwrapToolResult(result) {
  if (!result) return result;
  const structured = result.structuredContent;
  if (structured && typeof structured === 'object') return structured;
  const content = result.content;
  if (Array.isArray(content)) {
    const textPart = content.find((c) => c && c.type === 'text' && typeof c.text === 'string');
    if (textPart) {
      try {
        return JSON.parse(textPart.text);
      } catch {
        return { text: textPart.text };
      }
    }
  }
  return result;
}

async function initialize(endpoint) {
  return mcpRpc(endpoint, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'buddylists-teleport', version: '0.2.0' },
  });
}

async function listTools(endpoint) {
  const { result, ms } = await mcpRpc(endpoint, 'tools/list');
  return { tools: result.tools || [], ms };
}

async function callTool(endpoint, name, args = {}) {
  const { result, ms } = await mcpRpc(endpoint, 'tools/call', { name, arguments: args });
  return { result: unwrapToolResult(result), raw: result, ms };
}

module.exports = {
  DEFAULT_ORIGIN,
  DEFAULT_MCP,
  postJson,
  getJson,
  mcpRpc,
  unwrapToolResult,
  initialize,
  listTools,
  callTool,
};
