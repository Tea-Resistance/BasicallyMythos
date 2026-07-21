# BasicallyMythos — Claude Code 模型重路由可观测性 + 自选回退模型

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![proxy size](https://img.shields.io/badge/proxy-123%20lines-blue.svg)](kimi-reroute-proxy.cjs)
[![deps](https://img.shields.io/badge/dependencies-zero-brightgreen.svg)](kimi-reroute-proxy.cjs)
[![English README](https://img.shields.io/badge/README-English-blue.svg)](README.md)

**看清 Claude Code 每一次把你的请求重路由到另一个模型 — 并自己选择回退模型。**

当 Fable 5 触发安全保护机制时,Claude Code 会把该请求静默地改用 Opus 重新执行。
通过这套配置,它会被自动改发到 **Kimi K3** — 会话中途自动完成,
其余所有流量仍走你的 Anthropic 订阅,完全不受影响。
而且,无论你是否更换回退模型,代理都会**记录每一次重路由**,
让静默降级第一次变得可见。

无需第三方路由器,无需任何依赖包。一个约 100 行的零依赖 Node 代理 + 两个配置项。

![实时重路由捕获](assets/demo.gif)

```
[2026-07-21T09:01:57Z] anthropic model=claude-fable-5 POST /v1/messages -> 429
[2026-07-21T09:02:10Z] KIMI      model=kimi-k3        POST /v1/messages -> 200
```
*每一条 KIMI 日志,都是一次被捕获的静默降级 — 并由你选择的模型作答。*

## 为什么

- **安全重路由是静默的。** 没有横幅、没有警告 — 回答只是悄悄来自另一个模型。
- **回退模型应由你决定。** 重路由目标是一个客户端配置值,代理让你把它指向开放模型。
- **零信任面。** 零依赖、仅监听本地回环地址,Anthropic 鉴权原样透传,Kimi 密钥只存钥匙串。

## 快速开始

```bash
cp kimi-reroute-proxy.cjs ~/.claude/
security add-generic-password -s moonshot-kimi -a "$USER" -w "sk-kimi-你的密钥"
cp com.kimi-reroute-proxy.plist ~/Library/LaunchAgents/   # 先修改 YOUR_USERNAME 和 node 路径
launchctl load ~/Library/LaunchAgents/com.kimi-reroute-proxy.plist
# 然后把 settings-snippet.json 合并进 ~/.claude/settings.json 并重启 Claude Code
```

用 `/status` 验证(Base URL 应显示 `http://127.0.0.1:8787`)。
Kimi 订阅密钥(`sk-kimi-...`)的正确端点是 `https://api.kimi.com/coding/v1/messages`
(完整 Anthropic Messages 格式,支持流式) — 它们**不是** Moonshot 平台密钥,
在 `api.moonshot.ai` 上会返回 401。

## 工作原理

Claude Code 的安全回退是**客户端行为**:请求被标记后,
CLI 会使用 `ANTHROPIC_DEFAULT_OPUS_MODEL` 中的模型 id 重新发起请求,
发送到与其他请求相同的 `ANTHROPIC_BASE_URL`。

因此:

1. `ANTHROPIC_DEFAULT_OPUS_MODEL=kimi-k3[1m]` — 重路由请求的目标变成 Kimi。
2. `ANTHROPIC_BASE_URL=http://127.0.0.1:8787` — 所有流量经过本地小代理。
3. 代理按模型 id 分流:
   - `kimi*` → Kimi 的 Anthropic 兼容网关(`api.kimi.com/coding`),注入钥匙串中的 Kimi 密钥
   - 其他全部 → 透明转发到 `api.anthropic.com`(你的正常鉴权/订阅不受影响)

效果:正常的 Fable 会话走 Anthropic;安全机制触发的那一刻,
该请求落到 Kimi K3(100 万上下文)而不是 Opus。

## 路线图

| 版本 | 内容 |
|---|---|
| v0.2 | `stats` 命令 — 可截图分享的重路由统计摘要 |
| v0.3 | Linux systemd 单元 + Windows 说明 |
| v0.4 | 多提供商回退预设(GLM / DeepSeek / OpenRouter) |
| v1.0 | 测试、语义化版本、文档冻结 |

## 常见问题

**这违反 Anthropic 的服务条款吗?** 它在你自己的机器上、针对你自己的会话本地运行。
它做的是记录而不是隐藏,把被标记的请求转发到另一家提供商,不伪装任何东西,不共享任何 API 密钥。

**会影响我的 Anthropic 鉴权或配额吗?** 不会。Anthropic 流量原样透传。
只有本来就被标记为重路由的请求才走 Kimi 分支。

**支持 Windows/Linux 吗?** 目前支持 macOS(launchd + 钥匙串)。
Linux 和 Windows 已在路线图中 — 欢迎提 issue 和 PR。

**为什么是 Kimi K3?** 开放权重、100 万上下文、Agent Arena 第 4 名(与 Opus 4.8 同级)。
任何 Anthropic 兼容端点都可以 — 见下文环境变量覆盖。

---

由 **Mythos** 构建 — 在 X 上关注 [@TEA_Resistance](https://x.com/TEA_Resistance) 获取构建动态。
欢迎 issue 和 PR。如果它帮你捕获到了重路由,点个 star 让更多人看到。
