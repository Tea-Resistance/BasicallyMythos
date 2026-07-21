# Contributing

Issues and PRs welcome. The proxy is deliberately ~123 lines of dependency-free
Node — keep it that way.

- **Bug reports** must include an excerpt of `~/.claude/kimi-reroute-proxy.log`
  (redact anything sensitive) and your Claude Code version.
- **Provider requests** (new fallback targets) need an Anthropic-compatible
  endpoint and a test transcript.
- **Good first issues**: Windows service script, Linux systemd unit, `stats`
  command, README translation review.

The one rule: nothing that phones home, hides traffic, or adds dependencies.
