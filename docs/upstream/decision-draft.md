# 接口决策草案（agent-p0-inventory）

> 基线 SHA：80f137edaa2cf7393cdf5bbec314051174631d69

## 已确认可纳入契约的能力

### 1. 文本选区获取
- **上游证据**：`apps/readest-app/src/types/view.ts:50` `getContents()` 方法，`apps/readest-app/src/app/reader/hooks/useTextSelector.ts:186,353,394` 调用 `doc.getSelection()`
- **建议端口名**：`getTextSelection(): TextSelection | null`
- **返回结构**：`{ text: string, range: Range, index: number, cfi: string, page: number }`（apps/readest-app/src/utils/sel.ts:35-43）
- **使用场景**：AI 翻译选中段落、生成选区注释、选中文本发送到增强服务

### 2. CFI 定位与内容访问
- **上游证据**：`apps/readest-app/src/types/view.ts:91-92,98` `getCFI(index, range)` 和 `resolveCFI(cfi)`
- **建议端口名**：`resolveLocation(cfi: string): { index: number, text: string }` 和 `getCurrentLocation(): string`（返回当前页 CFI）
- **使用场景**：增强功能记录用户位置、AI 总结特定段落（通过 CFI 定位）、跨会话恢复阅读位置

### 3. 书籍导入
- **上游证据**：`apps/readest-app/src/services/appService.ts:406-411` `AppService.importBook(file, books, options)`
- **建议端口名**：`importBook(file: File | string): Promise<BookHandle>`，返回 `BookHandle` 含 `hash`, `title`, `author`
- **使用场景**：用户从增强功能直接导入书籍到 Readest 书库、AI 推荐书籍自动添加

### 4. TTS 播放控制
- **上游证据**：`apps/readest-app/src/services/tts/TTSController.ts:1617,1632` `speak()`, `play()`, `pause()`, `stop()` 方法
- **建议端口名**：`startTTS()`, `pauseTTS()`, `resumeTTS()`, `stopTTS()`
- **事件监听**：`onTTSStateChange(callback: (state: { active: boolean, playing: boolean }) => void)`（apps/readest-app/src/utils/event.ts eventDispatcher）
- **使用场景**：增强功能提供自定义 TTS UI、远程控制 TTS 播放（如手表 App）、AI 驱动的章节导航

### 5. 阅读进度获取
- **上游证据**：`apps/readest-app/src/types/view.ts:92-97` `getCFIProgress(cfi)` 返回 `{ fraction, section, location, time }`
- **建议端口名**：`getReadingProgress(): { percent: number, currentPage: number, totalPages: number }`
- **使用场景**：增强功能显示阅读统计、AI 生成阅读报告、跨设备同步进度

---

## 建议纳入但需桥接的能力

### 1. 跨 iframe 选区监听（需事件桥接）
- **上游现状**：应用层通过 `getContents()` 轮询所有 iframe 文档的 `getSelection()`（useTextSelector.ts:186,451）
- **需要的桥接**：
  - **方案 A**（推荐）：在每个 iframe 内注入监听器，通过 `postMessage` 发送 `selectionchange` 事件到父窗口，增强功能监听父窗口事件
  - **方案 B**（兼容当前）：增强功能调用 `pollSelection(interval: number)` 启动轮询，返回 `stopPolling()` 函数
- **上游证据**：`packages/foliate-js/paginator.js:1651` iframe 内 `selectionchange` 事件，但无跨边界传递机制
- **使用场景**：实时翻译选中文本（无需用户手动触发）、选区自动高亮同步到其他设备

### 2. 全书文本提取（需批量迭代器）
- **上游现状**：`book.sections` 数组含所有章节元数据，需逐章调用 `book.load(section.id)` 获取 Blob 再转文本
- **需要的桥接**：封装 `extractAllText(bookHash: string, onProgress?: (chapter: number, total: number) => void): AsyncIterable<{ sectionTitle: string, text: string }>`
- **上游证据**：`apps/readest-app/src/libs/document.ts:112` `BookDoc` 接口，`book.sections` 和 `book.load()`
- **使用场景**：AI 全书摘要、全文搜索索引构建、导出纯文本

### 3. 自定义 TTS 引擎接入（需实现接口）
- **上游现状**：`TTSClient` 接口（TTSClient.ts:38）定义了 `init()`, `speak()`, `pause()`, `resume()`, `stop()` 方法
- **需要的桥接**：增强功能实现 `TTSClient` 接口，通过 `registerTTSEngine(engine: TTSClient)` 注册到 `TTSController`
- **上游证据**：现有三个实现类 `EdgeTTSClient`, `NativeTTSClient`, `WebSpeechClient`
- **使用场景**：接入第三方 TTS API（如 OpenAI TTS）、多语言混合朗读、情感化语音合成

### 4. 书签持久化（需验证 API）
- **上游现状**：`BookConfig.location` 存储当前位置（types/book.ts:617），`BookNote` 类型含 `cfi` 字段（types/book.ts:195），但未找到显式 `addBookmark()` 函数
- **需要的桥接**：验证 `BookNote` 是否可用作书签，或封装 `addBookmark(cfi: string, title?: string): Promise<void>` 和 `getBookmarks(): Promise<Bookmark[]>`
- **上游证据**：`apps/readest-app/src/types/book.ts:195` `BookNote` 含 `cfi`, `text`, `note` 字段
- **使用场景**：AI 自动标记重点段落、跨设备同步书签、生成书签导览

---

## 明确不纳入的能力（含原因）

### 1. Android 后台定时任务
- **原因**：代码仓未包含 `WorkManager` 或 `JobScheduler` 实现（搜索 `apps/readest-app/src-tauri/gen/android/` 无结果）
- **影响**：增强功能不应依赖 Readest 提供后台数据同步或定时下载能力（TTS 章节下载除外，由前台 `TTSDownloader` 执行）
- **替代方案**：增强功能自行实现后台服务，或通过前台轮询

### 2. 远程推送通知
- **原因**：`AndroidManifest.xml:9` 声明 `POST_NOTIFICATIONS` 权限，但未找到 FCM 或推送服务集成
- **影响**：增强功能无法通过 Readest 向用户推送通知
- **替代方案**：增强功能自建推送服务，或使用 WebSocket 前台长连接

### 3. 原生文件系统深度访问
- **原因**：Readest 通过 Tauri FileSystem API 访问沙盒目录（`appDataDir`），增强功能无直接文件系统权限
- **影响**：增强功能不能直接读取 Readest 书库文件（需通过 `importBook` 或 `exportBook` 中转）
- **替代方案**：通过 Readest 端口导出书籍内容，或请求用户授权独立文件访问

### 4. 修改 foliate-js 渲染逻辑
- **原因**：foliate-js 是 Git 子模块（packages/foliate-js，指针 `98b82a517`），增强功能修改需上游合并或本地 fork
- **影响**：增强功能不能注入自定义渲染器或修改分页算法
- **替代方案**：通过 CSS 注入（`view.setStyles()`）调整样式，或在 iframe 外层 overlay 实现自定义 UI

---

## 接口需求清单（提交给 agent-core-contract）

### 强制要求（agent-core-contract 必须满足）

1. **CFI 作为唯一位置标识符**
   - 所有位置相关端口必须接受和返回 CFI 字符串（而非 DOM Range 或页码）
   - CFI 与书籍版本绑定，重新导入同一本书可能导致 CFI 失效，端口需文档化此风险

2. **iframe 隔离兼容**
   - 跨 iframe 数据传递（如选区、高亮）必须序列化为 JSON，不能直接传递 DOM 对象
   - 证据：foliate-js 内容在 `sandbox="allow-same-origin allow-scripts"` iframe 中（paginator.js:729）

3. **平台差异透明化**
   - TTS 端口必须在 Web/Tauri/iOS/Android 四个平台上行为一致
   - 后台播放能力仅 Android/iOS 可用，Web/Desktop 需用户保持标签页活跃，端口需文档化

4. **事件驱动架构**
   - 状态变更（TTS 播放/暂停、页面跳转、选区变化）必须通过事件通知增强功能
   - 使用 `eventDispatcher.on('event-name', callback)` 模式（apps/readest-app/src/utils/event.ts）

5. **错误处理**
   - 所有异步端口返回 `Promise<T>`，拒绝时必须返回结构化错误（含 `code`, `message`, `cause`）
   - 示例错误码：`BOOK_NOT_FOUND`, `CFI_INVALID`, `TTS_ENGINE_UNAVAILABLE`

### 推荐但非强制

1. **版本协商机制**
   - 端口定义含 `version` 字段（如 `"1.0.0"`），增强功能启动时校验版本兼容性
   - 不兼容时降级到安全子集或显示警告

2. **权限模型**
   - 敏感端口（如 `importBook`, `exportBook`）需用户首次授权
   - 授权状态通过 `checkPermission(port: string): Promise<'granted' | 'prompt' | 'denied'>` 查询

3. **性能预算**
   - `extractAllText()` 等批量操作需支持取消（`AbortSignal`）和进度回调
   - 单次端口调用响应时间建议 < 100ms（阻塞主线程操作）或提供异步队列

---

## 开放问题（需主会话裁决）

### 1. 端口部署位置
- **问题**：增强功能与 Readest 的通信边界在哪里？
- **选项 A**：增强功能作为 Readest 内嵌 iframe（类似 foliate-js），通过 `postMessage` 通信
- **选项 B**：增强功能作为独立 Web 应用，通过 WebSocket 或 HTTP API 与 Readest 通信
- **选项 C**：增强功能作为 Tauri plugin（原生扩展），直接调用 Readest 内部 TypeScript 函数
- **影响**：选项 A 受 CSP 限制（tauri.conf.json:17 `csp` 字段），选项 B 需 CORS 配置，选项 C 需 Rust/Kotlin/Swift 桥接层
- **建议裁决依据**：增强功能的复杂度（简单翻译用 A，复杂 AI 服务用 B，深度集成用 C）

### 2. 用户数据隐私边界
- **问题**：增强功能能否访问书籍全文？（AI 总结需全文，但涉及版权和隐私）
- **裁决点**：
  - 是否限制 `extractAllText()` 只能在用户明确授权后调用？
  - 导出的文本是否需脱敏（如移除书籍元数据、用户注释）？
  - 增强功能是否允许缓存书籍内容？（缓存时长、存储位置）
- **建议**：在 Phase 0 只开放"当前页文本提取"，全书提取延后到 Phase 1 实现完整权限模型后

### 3. TTS 音频流所有权
- **问题**：增强功能能否接管 TTS 音频流？（如实时修改音高、添加背景音乐）
- **裁决点**：
  - `TTSClient.speak()` 返回的 `AsyncIterable<TTSMessageEvent>` 中 `audio` 事件是否可被增强功能拦截？
  - 如果可以，音频格式是什么？（PCM、MP3、Opus）
  - 如果不可以，增强功能如何实现自定义 TTS 效果？
- **建议**：Phase 0 只开放播放控制（play/pause/stop），音频流操作延后到需求明确后

### 4. 多书籍并发
- **问题**：用户同时打开多本书时，端口的 `bookHash` 参数如何传递？
- **裁决点**：
  - 增强功能是否需感知"当前活跃书籍"？（如用户切换标签页时自动切换上下文）
  - 还是每个端口调用都必须显式传递 `bookHash`？
- **建议**：端口设计为"显式 bookHash 参数"（如 `getTextSelection(bookHash)`），避免隐式状态，但提供 `getCurrentBookHash()` 辅助函数

### 5. 离线能力
- **问题**：增强功能是否需支持离线模式？（如飞行模式下仍可使用本地 AI 模型）
- **裁决点**：
  - CFI 解析、文本提取等端口是否需纯本地实现（不依赖网络）？
  - 还是允许增强功能在离线时降级功能？
- **建议**：Phase 0 端口设计为离线优先（所有读取操作本地执行），只有 TTS 合成等需网络的操作才允许在线依赖
