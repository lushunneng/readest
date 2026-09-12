# agent-ai-study：LLM 理解辅助与学习面板实现报告

> 执行日期：2026-09-11  
> 分支：`phase0/baseline`  
> 写集：`enhanced/features/ai/**`

---

## 1. 摘要

**Gate 状态：✅ 通过（无服务端 gateway 条件下的最大交付）**

实现了完整的 AI 学习辅助层，包括 provider 抽象、gateway 客户端、本地降级、配额守卫、审计日志、学习统计和 StudyController 编排。客户端无第三方密钥，所有 LLM 调用通过服务端 gateway 代理。无 gateway 时自动降级为本地离线提示，不阻塞其余功能。

---

## 2. 实现文件

| 文件 | 说明 |
|---|---|
| `enhanced/features/ai/ai-provider.ts` | 类型契约：AIProvider 接口、StudyRequest/Response、AuditEntry |
| `enhanced/features/ai/local-provider.ts` | 本地降级 provider，无网络调用，提供明确的离线提示 |
| `enhanced/features/ai/gateway-provider.ts` | SSE 流式 gateway 客户端，含超时、AbortSignal、quota 429 处理 |
| `enhanced/features/ai/audit-log.ts` | IndexedDB 审计日志，只存元数据（不含请求/响应内容） |
| `enhanced/features/ai/study-stats.ts` | IndexedDB 学习统计，按 type/provider 聚合，90 天自动清理 |
| `enhanced/features/ai/study-controller.ts` | 编排层：provider 选路、配额检查、context 截断、审计写入 |
| `enhanced/features/ai/__tests__/study-controller.test.ts` | 单元测试（vitest），IndexedDB 模块用 in-memory stub 替换 |
| `enhanced/features/ai/index.ts` | 公共出口，内部结构对消费者透明 |

---

## 3. 安全约束

- **客户端零密钥**：GatewayProvider 只持有 gateway URL，不含任何第三方 API key。
- **上下文范围**：selectedText 截断至 2000 字符，articleContext.text 截断至 8000 字符，在请求离开客户端前完成。
- **审计内容**：只记录请求类型、provider、selectedText 长度和时间戳，不记录文本内容。
- **SSE 取消**：通过 AbortSignal 传递到 fetch，gateway 和 local 两个 provider 均支持取消；取消后审计条目标记 `cancelled: true`。
- **配额守卫**：24 小时滚动窗口，上限 200 次请求；超限自动降级 LocalProvider，不报错。

---

## 4. 功能覆盖

| 功能 | 实现 | 说明 |
|---|---|---|
| 俚语/惯用语解释 | `explain_slang` | system prompt 针对非母语读者优化 |
| 难句简化改写 | `simplify_sentence` | 只返回改写结果，不含解释 |
| 文章摘要 | `summarize` | 3-5 句，聚焦主论点 |
| 上下文问答 | `ask_question` | 严格限制在用户提供的文章文本范围内 |
| 离线降级 | LocalProvider | 明确标注 [Offline]，用户不会误认为 AI 回答 |
| 学习统计 | study-stats.ts | 按类型/provider 统计，可由固定事件重放 |

---

## 5. 未进入本阶段的功能

按计划约束，以下功能**未实现**：

- **跟读 / ASR（自动语音识别）**：需要专项音频接入，列为后续阶段。
- **读后自查题库**：方案要求先使用人工审定样本，LLM 仅作候选。当前只有 StudyController 骨架可以接入，题库本身不在本 agent 写集内。
- **服务端 gateway 实现**：客户端已实现完整 SSE 消费协议（`POST /study/stream`，`GET /health`），服务端由 lsn 按提案独立实现。

---

## 6. 接口契约（供服务端参考）

### 健康检查
```
GET /health
→ 200 OK（gateway 可用）
→ 非 200（GatewayProvider.isAvailable() 返回 false，降级 LocalProvider）
```

### 流式问答
```
POST /study/stream
Content-Type: application/json
Accept: text/event-stream

{
  "type": "explain_slang" | "simplify_sentence" | "summarize" | "ask_question",
  "selected_text": "<最多 2000 字符>",
  "article_text": "<最多 8000 字符>",
  "question": "<仅 ask_question 时>（可选）"
}

SSE 响应格式：
data: {"delta": "...", "done": false}
data: {"delta": "", "done": true}
data: [DONE]

错误响应（嵌在 SSE 流中）：
data: {"error": {"code": "QUOTA_EXCEEDED", "message": "...", "retry_after_ms": 60000}}

HTTP 429（备用）：
Retry-After: 60
```

---

## 7. 验证结果

单元测试覆盖：gateway 优先选路、unavailable 降级、quota 降级、context 截断、审计写入、取消传播、buildSystemPrompt 完整性。

测试在 vitest Node 环境运行，IndexedDB 依赖用 in-memory stub 替换，无需浏览器运行时。
