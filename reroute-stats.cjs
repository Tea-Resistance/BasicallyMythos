#!/usr/bin/env node
/*
 * reroute-stats — print a shareable summary of your Claude Code reroute log.
 * Usage: node reroute-stats.cjs [logfile] [--json]
 * Default logfile: ~/.claude/kimi-reroute-proxy.log
 * Zero dependencies. Output is formatted for screenshots.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const logPath = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : path.join(os.homedir(), '.claude', 'kimi-reroute-proxy.log');
const asJson = process.argv.includes('--json');

const line = fs.readFileSync(logPath, 'utf8').trim().split('\n');
const pat = /^\[(.+?)\] (\S+) model=(\S+) POST (\S+) -> (\d+)$/;
const ev = [];
for (const l of line) {
  const m = l.match(pat);
  if (m) ev.push({ ts: new Date(m[1]), backend: m[2], model: m[3], status: +m[5] });
}
if (!ev.length) { console.error('no reroute events found in', logPath); process.exit(1); }

const total = ev.length;
const kimi = ev.filter(e => e.backend === 'KIMI');
const anth = ev.filter(e => e.backend === 'anthropic');
const a429 = anth.filter(e => e.status === 429).length;
const kOk = kimi.filter(e => e.status === 200).length;
const first = ev[0].ts, last = ev[ev.length - 1].ts;
const days = Math.max(1, (last - first) / 864e5);
const rate = (100 * kimi.length / total).toFixed(1);

const byDay = {};
for (const e of ev) {
  const d = e.ts.toISOString().slice(0, 10);
  byDay[d] = byDay[d] || { total: 0, kimi: 0 };
  byDay[d].total++;
  if (e.backend === 'KIMI') byDay[d].kimi++;
}

const out = {
  window: { first: first.toISOString(), last: last.toISOString(), days: +days.toFixed(1) },
  total_requests: total,
  rerouted: { count: kimi.length, pct: +rate },
  rerouted_success_pct: +(100 * kOk / Math.max(1, kimi.length)).toFixed(1),
  direct_route_429s: a429,
  per_day: byDay,
};
if (asJson) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }

const bar = (n, max, w = 18) => '█'.repeat(Math.max(1, Math.round(w * n / max))).padEnd(w, '░');
const maxDay = Math.max(...Object.values(byDay).map(d => d.total));
console.log('');
console.log('  reroute report — ' + first.toISOString().slice(0, 10) + ' → ' + last.toISOString().slice(0, 10));
console.log('  ' + '─'.repeat(46));
console.log(`  requests logged        ${total.toLocaleString()}`);
console.log(`  rerouted to fallback   ${kimi.length.toLocaleString()}  (${rate}%)`);
console.log(`  fallback success       ${(100 * kOk / Math.max(1, kimi.length)).toFixed(1)}%`);
console.log(`  direct-route 429s      ${a429}`);
console.log('  ' + '─'.repeat(46));
for (const [d, v] of Object.entries(byDay)) {
  console.log(`  ${d.slice(5)}  ${bar(v.total, maxDay)} ${String(v.total).padStart(5)}  (${v.kimi} rerouted)`);
}
console.log('');
console.log('  every reroute is a silent downgrade that got caught.');
console.log('  github.com/Tea-Resistance/BasicallyMythos');
console.log('');
