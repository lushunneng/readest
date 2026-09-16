# V1 降级方案：前台播放模式

> 决策日期：2026-09-15  
> 决策者：lsn  
> 依据：`docs/v1/v1-report.md`（V1 Gate FAIL，OriginOS 后台限流）

---

## 决策结论

**采用前台播放（Foreground Playback）作为 V1 降级路径。**

---

## 背景

V1 Gate 测试结果显示：
- 理想延迟完全达标：1.1-2.1秒，p95 = 2.1秒（远低于 15秒门限）
- OriginOS 后台限流导致不可用：连续冷启动 6-9 次后，vivo 的"异常行为检测"永久屏蔽 TTS 服务绑定，成功率仅 22.9%
- 根本原因：OriginOS 将重复后台启动识别为异常行为，静默丢弃广播 Intent 并阻塞 `TextToSpeech` 服务连接

---

## 降级路径对比

| 方案 | 用户体验 | 实现成本 | 可行性 |
|---|---|---|---|
| **前台播放** ✅ | 朗读时保持 App 前台可见，直接绕过 OriginOS 限流 | 最小（通知栏控制已有） | 高 |
| 预下载后播放 | 先缓存音频再播放，增加一轮网络延迟 | 中等（需适配 `EdgeTTSClient` + `audio-cache.ts`）| 中 |
| 纯阅读模式 | 禁用 TTS，影响产品核心价值 | 无（关闭功能）| 低 |

---

## 前台播放模式设计

### 行为规范

1. **TTS 激活时强制前台**
   - 用户点击"播放"后，App 进入前台锁定状态
   - 系统通知栏显示播放控制（播放/暂停/停止）
   - 用户可以切换到其他 App，但会收到"返回 Readest 以继续播放"提示

2. **锁屏处理**
   - 锁屏时继续播放（Android foreground service 保证）
   - 锁屏界面显示媒体控制（利用 `MediaSession` API）

3. **后台限制豁免**
   - 前台 Service 不受 OriginOS 后台限流影响
   - `startForeground()` 调用后，TTS 服务绑定不会被系统屏蔽

### 实现要点

**Android 侧（已部分实现）**

`NativeTTSPlugin.kt` 需要确保在 TTS 播放时持有 foreground service：

```kotlin
// 播放开始时
val notification = createTTSNotification()
startForeground(NOTIFICATION_ID, notification)

// 播放停止时
stopForeground(true)
```

**UI 侧（apps/readest-app）**

`TTSController.ts` 在 `play()` 时调用 Tauri 原生接口请求前台状态：

```typescript
async play() {
  // Request foreground service on Android
  if (isTauriAndroid()) {
    await invoke('plugin:native-tts|request_foreground');
  }
  // ... existing play logic
}
```

**用户引导**

首次使用 TTS 时，显示一次性提示：

> **提示**：为确保播放稳定，朗读期间请保持 Readest 在前台或锁屏播放。

---

## 当前状态

### 已有基础设施（无需修改）

- `enhanced/features/tts/edge-provider.ts` — Edge TTS WebSocket 客户端
- `enhanced/features/tts/audio-cache.ts` — 音频缓存层
- `enhanced/features/tts/speech-port-impl.ts` — SpeechPort 适配器
- `apps/readest-app/src-tauri/plugins/tauri-plugin-native-tts` — Android 原生 TTS 插件

### 需要补充的文件

- `NativeTTSPlugin.kt` 添加 `request_foreground()` / `release_foreground()` 命令
- `TTSController.ts` 在 `play()` 和 `stop()` 分别调用上述命令
- AndroidManifest.xml 声明 `FOREGROUND_SERVICE` 权限和 Service

### Windows 侧未提交的修复

以下三个文件的修改已在 Windows 本地，但未提交到 `phase0/baseline`，需要合入：

1. `gen/android/app/src/main/AndroidManifest.xml` — 添加 `<queries>` for `TTS_SERVICE`（必须合入，否则 targetSdk 36 下 TTS 无法初始化）
2. `gen/android/app/src/main/res/values/colors.xml` — 添加 `ic_launcher_background`（AAPT2 构建修复）
3. `tauri-plugin-native-tts/android/.../NativeTTSPlugin.kt` — V1_GATE 测试桩（可选，用于后续验证）

---

## 下一步行动

1. **合入 Windows 侧修复**（lsn 操作）
   - 从 Windows 工作目录提交上述三个文件的修改
   - 推送到 `phase0/baseline`

2. **实现前台 Service 调用**（开发任务）
   - 在 `NativeTTSPlugin.kt` 添加 `request_foreground()` 命令
   - 在 `TTSController.ts` 调用该命令
   - 添加用户首次使用提示

3. **V1 复测**（可选）
   - 在 iQOO Neo10 Pro+ 上重新运行 50 次冷启动测试
   - 验证前台模式下 OriginOS 不再限流

---

## 备注

- Edge TTS 优先级高于原生 TTS（`TTSController.ts:398`），实际用户听到的是 Edge TTS，但 V1 测试测量的是原生 TTS。如果需要针对 Edge TTS 的正式 Gate 证据，需补充 `EdgeTTSClient` 的延迟测量。
- 前台播放模式不影响其他功能（翻译、导入、AI 学习），整个 enhanced 架构已完成。
