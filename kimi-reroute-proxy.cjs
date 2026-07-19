#!/usr/bin/env node
/*
 * Kimi-reroute proxy for Claude Code.
 *
 * Purpose: make the Fable-5 safety-safeguard reroute land on Kimi K3 instead of
 * Opus, while every other request stays on Anthropic.
 *
 * How: Claude Code's safeguard reroute re-runs the flagged request on the model
 * id given by ANTHROPIC_DEFAULT_OPUS_MODEL, sent to ANTHROPIC_BASE_URL. Point
 * ANTHROPIC_BASE_URL at this proxy and set ANTHROPIC_DEFAULT_OPUS_MODEL=kimi-k3[1m].
 * This proxy inspects each request's model id:
 *   - model starts with "kimi"  -> forward to the Kimi Code subscription gateway
 *     (api.kimi.com/coding, Anthropic-compatible), swap in the Kimi key, and strip
 *     any "[1m]"-style bracket suffix from the model id (gateway rejects it;
 *     verified 2026-07-19: wants plain "k3"/"kimi-k3")
 *   - anything else             -> transparent pass-through to api.anthropic.com (subscription auth preserved)
 *
 * Fail-safe: on any parse/upstream trouble for a non-kimi request, it still goes
 * to Anthropic. The proxy never touches auth except on the kimi branch.
 *
 * Kimi key: read from macOS keychain, service "moonshot-kimi" (no plaintext on disk).
 * Endpoint overrides: KIMI_MOONSHOT_HOST / KIMI_MOONSHOT_PREFIX (defaults api.kimi.com + /coding).
 */

const http = require('http');
const https = require('https');
const { execFileSync } = require('child_process');

const HOST = '127.0.0.1';
const PORT = Number(process.env.KIMI_PROXY_PORT || 8787);
const ANTHROPIC_HOST = 'api.anthropic.com';
const MOONSHOT_HOST = process.env.KIMI_MOONSHOT_HOST || 'api.kimi.com';
const MOONSHOT_PREFIX = process.env.KIMI_MOONSHOT_PREFIX || '/coding';

function moonshotKey() {
  try {
    return execFileSync('security', ['find-generic-password', '-s', 'moonshot-kimi', '-w'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

const isKimi = (m) => typeof m === 'string' && m.toLowerCase().startsWith('kimi');

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    let body = Buffer.concat(chunks);
    let model = '';
    let parsed = null;
    try {
      parsed = JSON.parse(body.toString('utf8')) || {};
      model = parsed.model || '';
    } catch {
      /* leave model empty -> anthropic pass-through */
    }

    const toKimi = isKimi(model);
    if (toKimi && parsed && /\[[^\]]*\]$/.test(model)) {
      // Kimi gateway rejects Claude Code's "[1m]" context-window suffix.
      parsed.model = model.replace(/\[[^\]]*\]$/, '');
      body = Buffer.from(JSON.stringify(parsed), 'utf8');
    }
    const upstreamHost = toKimi ? MOONSHOT_HOST : ANTHROPIC_HOST;
    const upstreamPath = toKimi ? MOONSHOT_PREFIX + req.url : req.url;

    const headers = { ...req.headers, host: upstreamHost };
    delete headers['content-length'];

    if (toKimi) {
      const key = moonshotKey();
      if (!key) {
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            error: { type: 'kimi_proxy', message: 'no moonshot-kimi key in keychain' },
          })
        );
        return;
      }
      headers['authorization'] = 'Bearer ' + key;
      delete headers['x-api-key'];
    }
    if (body.length) headers['content-length'] = Buffer.byteLength(body);

    const upstream = https.request(
      { host: upstreamHost, port: 443, method: req.method, path: upstreamPath, headers },
      (up) => {
        res.writeHead(up.statusCode, up.headers);
        up.pipe(res);
      }
    );
    upstream.on('error', (err) => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({ error: { type: 'kimi_proxy', message: String((err && err.message) || err) } })
      );
    });
    if (body.length) upstream.write(body);
    upstream.end();
  });
  req.on('error', () => {
    try {
      res.destroy();
    } catch {
      /* noop */
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(
    `[kimi-reroute] ${HOST}:${PORT} -> ${ANTHROPIC_HOST} (passthrough); model^=kimi -> ${MOONSHOT_HOST}${MOONSHOT_PREFIX}`
  );
});
