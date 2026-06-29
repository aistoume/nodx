# CLI provider — 用 Claude Code 订阅驱动 nodx（不填 API key）

> 让 nodx 在本地用你**已登录的 Claude Code 会话**（订阅 OR key）跑 LLM，而不是
> 单独配一个 Anthropic API key。

## 为什么这样做（正当性）

直接把 Claude 订阅的 **OAuth token 取出来打 Anthropic API** 违反 Anthropic 条款、
会封号——nodx **不做**这件事。这里走的是合规路子：nodx 把 LLM 调用**外包给本机的
`claude` CLI**（你被授权运行的工具），属于对自有工具的本地自动化。用的是 Claude Code
自己的认证，nodx 从不接触 token。

## 原理：同契约、换后端

nodx 前端 / `packages/ai` 一直是通过 HTTP 跟「网关」(`:8787`) 对话的，不关心网关背后
是什么。所以新增一个**说同样 HTTP 契约**的本地网关即可，前端零改动：

```
                       ┌─ pnpm start ─────→ @nodx/ai-gateway (Cloudflare worker)
nodx 前端 → :8787/v1/complete                  └→ api.anthropic.com（用 ANTHROPIC_API_KEY）
                       └─ pnpm start:cli ─→ @nodx/cli-gateway (本地 Node)
                                              └→ claude -p（你的 Claude Code 会话）
```

`workers/cli-gateway/src/server.mjs`（零依赖 Node 服务）实现：
- `GET /health`
- `POST /v1/complete` → `spawn('claude', ['-p','--output-format','json','--model',…,'--allowedTools',…,'--system-prompt',…])`，prompt 走 stdin；把 CLI 的结果信封
  （`{result, stop_reason, usage, modelUsage}`）映射成 worker 的
  `{text, stopReason, usage:{input_tokens,output_tokens}, model}`
- `POST /v1/embed` → `501`（嵌入需 Gemini key，CLI 模式拿不到 → CBR 检索不可用）

CLI 输出常带 ```json 围栏，`packages/ai/parse.ts:extractJsonObject` 本来就会剥掉，
所以 JSON 管线（survey/decompose/PM/评分员…）原样工作。

## 怎么用

**前置**：本机装了 Claude Code 且已登录（`claude` 能直接跑）。

```bash
pnpm start:cli          # 起 @nodx/cli-gateway(:8787) + 桌面 app
```

桌面 `.env.local` **无需改动**：`VITE_AI_GATEWAY_URL` 仍指 `:8787`；
`VITE_AI_CLIENT_TOKEN` 随便填个非空值即可（CLI 网关只在 localhost、忽略它）。
切回 API-key 模式就用 `pnpm start`。

环境变量（都可选）：`PORT`(默认 8787)、`CLAUDE_BIN`(默认 `claude`)、
`CLI_GATEWAY_TOKEN`(设了才校验 Bearer)、`CLI_GATEWAY_TIMEOUT_MS`(默认 300000)。

## 安全 / 行为细节

- **工具锁死**：不需要联网时传空 `--allowedTools` + `--max-turns 1`——agent **碰不到
  文件系统**，只产出一条文本。`enable_web_search` 时才放开 `WebSearch`/`WebFetch`
  并给 8 轮（研究员用）。
- **系统提示**：调用方给了 `system` 就用它；没给则用一句中性提示替换掉 Claude Code
  的"编码 agent"人设，让它当通用推理助手。
- **不报 max_tokens**：CLI 没法用 assistant_prefill 续写，所以网关把 `max_tokens`
  停止原因一律改成 `end_turn`（否则 nodx 的续写循环会重复拼接）。CLI 跑到模型满输出
  上限（如 haiku 32k），nodx 体量的 prompt 实际不会截断。

## 局限（相比 API-key 网关）

| 维度 | API-key 模式 | CLI 模式 |
|---|---|---|
| 计费 | 按 token | 走订阅（或 key） |
| 延迟 | 直连快 | 每次 cold-start `claude` ~5–7s |
| 并发 | 高 | 每调用一个 `claude` 进程（专家组并行会偏慢） |
| `max_tokens`/`temperature` | 支持 | CLI 不暴露，忽略 |
| 嵌入 / CBR 检索 | 可用 | **不可用**（/v1/embed 返回 501） |
| 适用 | 分发 / 多端 | 单机自用、终端 |

预算计量仍会按 `usage` 累计 token（用于显示），但订阅模式下没有真实的按调用计费。

## 涉及文件

```
workers/cli-gateway/package.json
workers/cli-gateway/src/server.mjs   零依赖 Node 网关（claude -p 后端）
package.json                          start:cli / cli-gateway 脚本
apps/desktop/.env.example             两种模式说明
```
