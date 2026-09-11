# 上游访问点盘点报告（agent-p0-inventory）

> 基线 SHA：80f137edaa2cf7393cdf5bbec314051174631d69
> 日期：2026-09-11

## 1. 文本选区（Text Selection）

### 1.1 入口位置
- **foliate-js 内层（iframe 文档）**：
  - `packages/foliate-js/view.js:150-151`：`#el.ownerDocument?.getSelection()` 用于判断选区是否存在
  - `packages/foliate-js/paginator.js:1651`：监听 `selectionchange` 事件
  - `packages/foliate-js/pdf.js:327-329`：PDF 文本层监听 `selectionchange`，检测选区长度
- **应用层（React hooks）**：
  - `apps/readest-app/src/app/reader/hooks/useTextSelector.ts:227,296,353,394`：多次调用 `doc.getSelection()` 获取原生选区
  - `apps/readest-app/src/app/reader/hooks/useTextSelector.ts:90-94`：iOS 触摸选区延迟至手势结束，通过 `pendingTouchSelection` ref 缓存

### 1.2 调用链
1. 用户在 foliate-js iframe 内选中文本
2. iframe 文档触发 `selectionchange` 事件（paginator.js:1651）
3. 应用层 `useTextSelector` hook 通过 `getContents()` 遍历所有 iframe 文档，调用 `doc.getSelection()` 读取选区
4. 将 DOM Range 转换为 `TextSelection` 对象（apps/readest-app/src/utils/sel.ts:35-43），含 `text`, `range`, `index`, `cfi` 字段
5. 回调 `setSelection` 更新 React 状态，驱动注释工具栏显示

### 1.3 限制与安全边界
- **iframe 隔离**：foliate-js 的内容渲染在 `sandbox="allow-same-origin allow-scripts"` iframe 中（paginator.js:729），选区对象不能直接跨 iframe 传递
- **事件冒泡**：`selectionchange` 仅在文档对象触发，无法从 iframe 冒泡至父窗口
- **跨文档选区**：分页视图中多个 iframe 可见时，useTextSelector 需遍历所有 `getContents()` 返回的文档（useTextSelector.ts:186,451）
- **触摸延迟**：iOS 选区手势期间 `selectionchange` 连续触发，应用层缓存至 `touchend`（useTextSelector.ts:90-94,979-1006）

### 1.4 判定
**可复用，但需最小桥接**：
- **可直接使用**：`view.renderer.getContents()` 返回 iframe 文档数组，应用层可遍历调用 `doc.getSelection()`
- **需桥接**：增强功能需要将选区位置转换为 CFI（通过 `view.getCFI(index, range)` 实现，view.ts:91），CFI 可持久化或跨会话传递

---

## 2. 正文内容访问（Body/Content Access）

### 2.1 入口位置
- **CFI 定位器**：
  - `apps/readest-app/src/types/view.ts:91-92`：`getCFI(index: number, range?: Range): string`
  - `apps/readest-app/src/types/view.ts:98`：`resolveCFI(cfi: string): { index: number; anchor: RangeAnchor }`
  - `packages/foliate-js/view.js:228`：`#cfiProgress` 内部状态
  - `packages/foliate-js/epub.js:866-879`：`resolveCFI` 解析 CFI 到 spine itemref 和 DOM anchor
- **段落内容提取**：
  - `apps/readest-app/src/app/reader/hooks/useTextSelector.ts:467`：`view.getCFI(index, range)` 获取选区 CFI
  - `apps/readest-app/src/app/reader/hooks/useParagraphMode.ts:313,366`：调用 `getParagraphPresentation` 从 DOM 提取段落文本
  - `apps/readest-app/src/utils/paragraphPresentation.ts`：从 Range 对象提取 `textContent`

### 2.2 调用链
1. **通过 CFI 定位**：
   - 应用层持有 CFI 字符串（如 `epubcfi(/6/4!/4/2/8:12)`）
   - 调用 `view.resolveCFI(cfi)` → 返回 `{ index: sectionIndex, anchor: RangeAnchor }`
   - `anchor(doc)` 在目标 iframe 文档中返回 DOM Range
   - 从 Range 读取 `range.toString()` 或 `range.startContainer.textContent`
2. **通过文档索引访问**：
   - `view.renderer.getContents()` 返回 `{ doc: Document, index: number }[]` 数组
   - 遍历 `doc.body` 或特定元素，读取 `textContent` / `innerHTML`

### 2.3 限制与安全边界
- **CFI 版本锁定**：CFI 字符串与书籍版本强绑定，重新导出 EPUB 后 CFI 可能失效（bookService.ts:55-63 的 `getStableMetadataHash` 尝试缓解）
- **DOM 访问限制**：只能访问已渲染页面的文档，未加载章节需先 `view.goTo(index)` 触发加载
- **iframe sandbox**：foliate-js 文档被 sandbox 隔离，父窗口只能通过 `getContents()` 返回的文档引用访问，无法用 `document.querySelector` 直接查询
- **XPointer 互操作**：Readest 同时支持 EPUB CFI 和 KOReader XPointer（apps/readest-app/src/utils/xcfi.ts），增强功能需处理两种格式

### 2.4 判定
**可复用**：
- `view.getCFI(index, range)` 和 `view.resolveCFI(cfi)` 提供完整的定位器往返转换
- `view.renderer.getContents()` 提供 iframe 文档访问，可直接读取文本
- **无需桥接**，但增强功能应记录 CFI 而非 Range 对象（Range 无法序列化）

---

## 3. 书籍导入（Library Import）

### 3.1 入口位置
- **核心函数**：
  - `apps/readest-app/src/services/bookService.ts:461`：`export async function importBook(fs, file, books, options)`
  - `apps/readest-app/src/services/appService.ts:406-411`：`AppService.importBook` 包装调用 `BookSvc.importBook`
  - `apps/readest-app/src/types/system.ts:201`：接口定义 `importBook(file: string | File, books: Book[], options?: ImportBookOptions): Promise<Book | null>`
- **调用位置**：
  - `apps/readest-app/src/hooks/useOpenWithBooks.ts:131`：外部文件打开时调用 `appService.importBook(file, library, { transient: true })`
  - `apps/readest-app/src/libs/shareImport.ts:119`：Android 分享意图处理调用
  - `apps/readest-app/src/hooks/useOPDSSubscriptions.ts:42-48`：OPDS 订阅下载后调用 `saveLibraryBooks`（通过 importBook 去重）

### 3.2 调用链
1. 用户触发导入（文件选择器、拖放、Android 分享意图）
2. 前端代码调用 `appService.importBook(file, library, options)`
3. `bookService.importBook` 执行：
   - 解析文件格式（EPUB: tauriEpubBridge, PDF: tauriPdfBridge, TXT: txt.ts TxtToEpubConverter）
   - 提取元数据 → `BookDoc.metadata`（document.ts:112）
   - 计算 `metaHash = getMetadataHash(metadata)` 和 `hash = md5(file)`（bookService.ts:21-25）
   - 在 `books` 数组中按 `byHash` / `byMetaKey` / `byStableKey` 查重（bookService.ts:65-90）
   - 如不重复，复制文件到 `appDataDir/library/<hash>.<ext>`，保存封面 `<hash>-cover.jpg`
   - 生成 `Book` 对象插入数据库（通过 `options.saveBookConfig` 回调）
4. 返回 `Book` 对象或 `null`（如已存在）

### 3.3 限制与安全边界
- **文件输入格式**：
  - `string`：本地绝对路径（Desktop/iOS inbox）、`content://` URI（Android）、HTTP URL
  - `File` 对象：Web 文件选择器或拖放 API
- **去重策略**：优先按文件 hash 精确匹配，其次按 `metaHash:format` 模糊匹配，PDF 特殊处理（仅按文件名，bookService.ts:61）
- **Tauri 桥接**：EPUB/PDF/Mobi 在 Tauri 平台优先使用原生解析器（tauriEpubBridge.ts, tauriPdfBridge.ts, tauriMobiBridge.ts），Web 平台回退到 foliate-js
- **transient 模式**：外部文件打开时 `transient: true` 标记为临时书籍，不持久化到书库（useOpenWithBooks.ts:131）

### 3.4 判定
**可复用**：
- `appService.importBook(file, library, options)` 是公开 API，接受 File 对象或路径字符串
- **无需桥接**，增强功能可直接调用，返回的 `Book` 对象包含 `hash`/`title`/`author`/`format`/`filePath`

---

## 4. TTS 接入点（Text-to-Speech）

### 4.1 入口位置
- **控制器**：
  - `apps/readest-app/src/services/tts/TTSController.ts:111`：`export class TTSController extends EventTarget`
  - `apps/readest-app/src/services/tts/TTSController.ts:1617`：`async speak(ssml: string | Promise<string>, oneTime = false)`
  - `apps/readest-app/src/services/tts/TTSController.ts:1632`：`play()` / `pause()` / `stop()`
- **客户端接口**：
  - `apps/readest-app/src/services/tts/TTSClient.ts:38`：`export interface TTSClient`，含 `init()`, `speak()`, `pause()`, `resume()`, `stop()` 方法
  - 实现类：`EdgeTTSClient`, `NativeTTSClient`, `WebSpeechClient`
- **foliate-js TTS 标记**：
  - `apps/readest-app/src/types/view.ts:108-112`：`view.initTTS(granularity?, nodeFilter?, highlight?): Promise<void>`
  - `apps/readest-app/src/types/view.ts:114`：`view.tts: ViewTTS | null`（foliate-js 的 TTS 实例或 MediaOverlayTTS）
  - `packages/foliate-js/tts.js:477-479`：TTS 标记句子选择逻辑

### 4.2 调用链
1. **初始化**：
   - `view.initTTS(granularity, nodeFilter, highlightCallback)` 初始化 foliate-js TTS（生成句子/段落标记）
   - `TTSController` 实例化并绑定 `view.tts`（useTTSControl.ts）
2. **播放**：
   - 用户触发播放 → 应用层 `eventDispatcher.dispatch('tts-speak')` 或直接调用 `controller.play()`
   - `controller.speak(ssml)` 将 SSML 传递给 `TTSClient.speak(ssml, signal)`
   - 客户端返回 `AsyncIterable<TTSMessageEvent>`，controller 消费事件流：
     - `audio` 事件 → 播放音频块
     - `boundary` 事件 → 高亮单词（word-level）或句子（sentence-level）
     - `mark` 事件 → 句子边界，触发 `view.tts` 的下一个标记
3. **控制**：
   - `pause()` / `resume()` / `stop()` 通过 `AbortController` 中止当前 `speak()` 异步迭代器
   - 状态变更通过 `eventDispatcher.dispatch('tts-playback-state', { active, playing })` 广播（useTTSControl.ts:112）

### 4.3 限制与安全边界
- **平台差异**：
  - **Web**：EdgeTTSClient（WebSocket 连接 `wss://speech.platform.bing.com`）或 WebSpeechClient（浏览器原生 `SpeechSynthesisUtterance`）
  - **Tauri Desktop**：同 Web
  - **iOS/Android Tauri**：NativeTTSClient（通过 Tauri plugin 调用平台 TTS 引擎）
- **跨 iframe**：TTS 标记由 foliate-js 在 iframe 文档内生成（tts.js），高亮回调跨 iframe 边界传递 Range 对象给应用层
- **音频焦点**：Android 通过 `MediaPlaybackService` 持有 `AudioFocusRequest`（MediaPlaybackService.kt:121-145），响应 `AUDIOFOCUS_LOSS` 暂停播放
- **后台播放**：依赖 MediaSession API（Web）或原生 MediaSession（Tauri），详见第 5 节

### 4.4 判定
**可复用，需最小桥接**：
- **可直接使用**：
  - `view.initTTS()` 生成 TTS 标记
  - `TTSController.speak(ssml)` / `play()` / `pause()` 控制播放
  - `eventDispatcher.on('tts-playback-state', callback)` 监听状态变更
- **需桥接**：
  - 增强功能若需自定义 TTS 引擎，需实现 `TTSClient` 接口（TTSClient.ts:38）
  - 跨语言朗读需预处理 SSML（controller.preprocessCallback，TTSController.ts:122）

---

## 5. 后台生命周期（Background Lifecycle）

### 5.1 入口位置
- **Android 前台服务**：
  - `apps/readest-app/src-tauri/gen/android/app/src/main/AndroidManifest.xml:10-11`：声明 `FOREGROUND_SERVICE` 和 `FOREGROUND_SERVICE_MEDIA_PLAYBACK` 权限
  - `apps/readest-app/src-tauri/gen/android/app/src/main/AndroidManifest.xml:308-315`：`MediaPlaybackService` 注册为 `MediaBrowserServiceCompat`
  - `apps/readest-app/src-tauri/plugins/tauri-plugin-native-tts/android/src/main/java/MediaPlaybackService.kt:41`：`class MediaPlaybackService : MediaBrowserServiceCompat()`
- **MediaSession 和音频焦点**：
  - `MediaPlaybackService.kt:42`：`private var mediaSession: MediaSessionCompat?`
  - `MediaPlaybackService.kt:64-99`：`AudioManager.OnAudioFocusChangeListener` 响应焦点变更（GAIN/LOSS/TRANSIENT）
  - `MediaPlaybackService.kt:121-145`：`requestFocus()` 请求 `AUDIOFOCUS_GAIN`，`setContentType(CONTENT_TYPE_SPEECH)` 和 `setWillPauseWhenDucked(true)` 声明语音内容
- **前台通知**：
  - `MediaPlaybackService.kt`：服务激活时必须创建前台通知（Android O+ 要求，未在代码段中完整展示但注释提及 "foreground notification"）
- **Web/Desktop MediaSession**：
  - `apps/readest-app/src/services/tts/ttsMediaBridge.ts:1-12`：注释说明锁屏 TTS 媒体会话必须超越 React 生命周期
  - `apps/readest-app/src/services/tts/ttsMediaBridge.ts:44-76`：`unblockAudio()` 创建静默 `<audio>` 元素保持 WebAudio 激活（iOS mute switch 绕过）

### 5.2 调用链
1. **Android TTS 播放开始**：
   - 应用调用 `TTSController.play()`
   - Tauri plugin 触发 `MediaPlaybackService` 会话激活（`sessionActive = true`）
   - 服务调用 `requestFocus()` 请求音频焦点
   - 创建前台通知，调用 `startForeground(NOTIFICATION_ID, notification)` 进入前台模式
   - `mediaSession.setActive(true)` 激活 MediaSession，锁屏显示播放控制
2. **焦点丢失处理**：
   - 导航提示打断 → `AUDIOFOCUS_LOSS_TRANSIENT` → `resumeOnFocusGain = true`，暂停播放
   - 焦点恢复 → `AUDIOFOCUS_GAIN` → 如 `resumeOnFocusGain` 为 true，调用 `player.play()` 并发送 `pluginEventTrigger('media-session-play')`
   - 耳机拔出 → `ACTION_AUDIO_BECOMING_NOISY` → 暂停且 `resumeOnFocusGain = false`（永不自动恢复，MediaPlaybackService.kt:104-114）
3. **Web/Desktop**：
   - `ttsMediaBridge.ts:47-76` 创建静默 `<audio>` 元素循环播放（绕过 iOS 静音开关）
   - `navigator.mediaSession` API 设置元数据和控制处理器（仅在 `<audio>` 播放时生效）

### 5.3 限制与安全边界
- **Android 特定**：
  - 前台服务需在 `AndroidManifest.xml` 声明 `FOREGROUND_SERVICE_MEDIA_PLAYBACK` 权限（manifest:11）
  - Android 8.0+ 前台服务必须显示通知，服务销毁时调用 `stopForeground(STOP_FOREGROUND_REMOVE)`
  - `MediaBrowserServiceCompat` 导出供 Android Auto 绑定（manifest:311 `android:exported="true"`），但当前版本已禁用 Android Auto 元数据（manifest:30-40 注释）
- **Kotlin 桥接层**：
  - `MediaPlaybackService.kt` 与 Tauri Rust plugin 通过 `pluginEventTrigger` 回调通信（kt:71,84,94,110）
  - 应用层 TypeScript 通过 `eventDispatcher.on('media-session-pause')` 监听原生事件
- **Web 限制**：
  - `navigator.mediaSession` 仅在有活跃媒体元素时生效（Chrome/Safari 锁屏控制需 `<audio>` 播放）
  - iOS Tauri 特殊处理：**不创建** `<audio>` 元素（ttsMediaBridge.ts:56），因为原生 TTS 已持有 `.playback` 音频会话
- **未生成的 Kotlin 代码**：
  - `apps/readest-app/src-tauri/gen/android/` 目录只有 `app/` 子目录和两个 Kotlin 文件（MainActivity.kt, KeyLearnCaptureTest.kt）
  - `MediaPlaybackService.kt` 位于 `src-tauri/plugins/tauri-plugin-native-tts/android/src/main/java/`（插件源码，非生成代码）

### 5.4 判定
**Android 部分可复用，Web 部分已完整实现**：
- **可直接使用**（Android）：
  - `MediaPlaybackService` 已处理音频焦点、前台通知、耳机拔出检测
  - 增强功能通过 Tauri plugin 事件（`media-session-play/pause/stop`）与服务交互
- **可直接使用**（Web/Desktop）：
  - `ttsMediaBridge.ts` 的 `TTSMediaBridge` 类管理 `navigator.mediaSession` 生命周期
  - 静音开关绕过逻辑已实现（`unblockAudio()`）
- **需注意**：
  - Android Auto 支持已禁用（manifest:30-40 注释），重新启用需添加 `<meta-data android:name="com.google.android.gms.car.application" ...>`
  - 增强功能若需后台下载或定时任务，需额外的 `WorkManager` 或 `JobScheduler`（当前未实现）

---

## 6. 未验证能力清单

### 6.1 Android 后台任务（非媒体播放）
- **搜索关键词**：`WorkManager`, `JobScheduler`, `AlarmManager`, `BroadcastReceiver` (非 `ACTION_AUDIO_BECOMING_NOISY`)
- **搜索路径**：`apps/readest-app/src-tauri/gen/android/`, `apps/readest-app/src-tauri/plugins/*/android/`
- **结果**：**未找到**，Android 项目只包含 `MediaPlaybackService` 前台服务和 `MainActivity`
- **影响**：下游 agent-core-contract 不应假设有后台同步或定时下载能力（TTS 章节预下载除外，由 `TTSDownloader` 在前台执行）

### 6.2 Wakelock / 屏幕常亮
- **搜索关键词**：`WakeLock`, `WAKE_LOCK`, `PowerManager`, `keepScreenOn`
- **搜索路径**：`apps/readest-app/src-tauri/gen/android/`, `apps/readest-app/src-tauri/src/android/`
- **结果**：**未找到**
- **影响**：TTS 播放时屏幕熄灭不会阻止播放（由 `MediaPlaybackService` 前台服务保证），但无自动保持屏幕常亮功能

### 6.3 原生通知（Push Notifications）
- **搜索关键词**：`FirebaseMessaging`, `FCM`, `NotificationChannel`（非 MediaPlaybackService 的播放通知）
- **搜索路径**：`apps/readest-app/src-tauri/`, `apps/readest-app/src/`
- **结果**：`AndroidManifest.xml:9` 声明 `POST_NOTIFICATIONS` 权限，但未找到 FCM 或推送服务实现
- **影响**：当前通知仅用于 `MediaPlaybackService` 前台通知，无远程推送能力

### 6.4 文本提取 API（全书内容访问）
- **搜索关键词**：`extractAllText`, `getFullText`, `getRawText`, `book.getAllSections`
- **搜索路径**：`apps/readest-app/src/libs/document.ts`, `packages/foliate-js/epub.js`
- **结果**：**未找到统一 API**，只能通过以下方式逐章提取：
  - `book.sections.map(async (section) => { const blob = await book.load(section.id); const text = await blob.text(); })`（需自行遍历）
  - 或加载每个 section 的 iframe 文档后读取 `doc.body.textContent`
- **影响**：agent-core-contract 若需全书文本搜索或 AI 总结，需封装批量提取逻辑

### 6.5 书签 / 阅读历史持久化 API
- **搜索关键词**：`addBookmark`, `saveHistory`, `BookConfig` 的 `bookmarks` / `history` 字段
- **搜索路径**：`apps/readest-app/src/types/book.ts`, `apps/readest-app/src/services/bookService.ts`
- **结果**：
  - `apps/readest-app/src/types/book.ts:617`：`BookConfig` 含 `location?: string` (CFI) 和 `xpointer?: string`
  - 未找到显式 `addBookmark` 函数，书签可能存储在 `BookNote` 类型中（book.ts:195，含 `cfi` 字段）
- **影响**：**部分可用**，阅读位置通过 `BookConfig.location` 持久化，书签通过 `BookNote` 管理，但 API 未完全验证

### 6.6 选区事件跨 iframe 边界传递
- **搜索关键词**：`postMessage`, `window.parent`, `CustomEvent` 从 iframe 发送
- **搜索路径**：`packages/foliate-js/paginator.js`, `packages/foliate-js/view.js`
- **结果**：
  - foliate-js 的 `relocate` / `load` / `create-overlay` 事件在 View 自定义元素上触发（view.js:186,194，paginator.js:3482,3592）
  - **未找到** `selectionchange` 跨 iframe 的 postMessage 机制
- **影响**：**已验证为轮询模式**：应用层通过 `getContents()` 主动遍历 iframe 文档调用 `getSelection()`，非事件驱动。增强功能若需实时选区监听，需在每个 iframe 文档内注入监听器或保持现有轮询

---

## 阻断下游 agent-core-contract 使用的能力

1. **Android 后台定时任务**（6.1）：无 `WorkManager`/`JobScheduler`，下游不应设计依赖后台同步的接口
2. **远程推送通知**（6.3）：无 FCM 集成，下游通知需前台轮询或 WebSocket
3. **全书文本提取 API**（6.4）：需自行封装逐章提取，下游若提供 AI 总结需预留文本批量提取时间
