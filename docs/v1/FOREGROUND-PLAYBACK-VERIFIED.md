# Android 前台播放功能验证完成

**日期：** 2026-09-16  
**分支：** phase0/baseline  
**验证者：** Claude Code

---

## ✅ 验证结论

**前台播放功能已完整实现并正确配置，无需额外开发。**

---

## 实现状态

### 核心功能 ✅

| 组件 | 文件 | 状态 | 说明 |
|------|------|------|------|
| 前台服务 | `MediaPlaybackService.kt` | ✅ 已实现 | 完整的 Android 前台服务实现 |
| 服务激活 | `NativeTTSPlugin.kt` | ✅ 已实现 | `set_media_session_active` 命令 |
| UI 集成 | `ttsMediaBridge.ts` | ✅ 已实现 | 自动激活/停止前台服务 |
| Manifest 配置 | `AndroidManifest.xml` | ✅ 已配置 | 所有必需权限和服务注册 |

### 关键实现点

1. **前台服务生命周期**
   - `MediaPlaybackService.kt:575-584` — `startForeground()` 启动前台服务
   - `MediaPlaybackService.kt:356-377` — `deactivateSession()` 停止前台服务
   - 使用 `FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK` 类型

2. **音频焦点管理**
   - `MediaPlaybackService.kt:64-98` — 完整的音频焦点处理
   - 支持 TRANSIENT / CAN_DUCK / LOSS 事件
   - 耳机拔出自动暂停

3. **服务激活流程**
   ```
   ttsMediaBridge.bind()
     ↓
   mediaSession.setActive({ active: true })
     ↓
   NativeTTSPlugin.set_media_session_active()
     ↓
   startForegroundService(MediaPlaybackService)
     ↓
   MediaPlaybackService.activateSession()
     ↓
   requestFocus() + showNotification() + startForeground()
   ```

4. **AndroidManifest.xml 配置检查**
   - ✅ 第 10 行：`FOREGROUND_SERVICE` 权限
   - ✅ 第 11 行：`FOREGROUND_SERVICE_MEDIA_PLAYBACK` 权限（Android 14+）
   - ✅ 第 9 行：`POST_NOTIFICATIONS` 权限（Android 13+）
   - ✅ 第 318-325 行：`MediaPlaybackService` 注册，`foregroundServiceType="mediaPlayback"`
   - ✅ 第 24-28 行：`TTS_SERVICE` queries（Android 11+）

---

## 与设计文档的对比

`docs/v1/degradation-foreground-playback.md` 提出的需求：

| 设计要求 | 实现状态 | 说明 |
|---------|---------|------|
| 播放时强制前台 | ✅ 已实现 | 通过 `set_media_session_active` 自动激活 |
| 通知栏控制 | ✅ 已实现 | 播放/暂停/上一句/下一句按钮 |
| 锁屏播放 | ✅ 已实现 | MediaSession 锁屏控制 |
| 后台限制豁免 | ✅ 已实现 | `startForeground()` 绕过 OriginOS 限流 |
| `request_foreground()` | ❌ 未实现 | 不需要，功能已通过 `set_media_session_active` 统一实现 |
| `release_foreground()` | ❌ 未实现 | 不需要，功能已通过 `set_media_session_active` 统一实现 |

**说明：** 设计文档提到的独立 `request_foreground()` / `release_foreground()` 命令未实现，因为这些功能已通过 `set_media_session_active` 统一实现，分离出独立接口会造成重复和架构不一致。

---

## 下一步行动

### 必需：V1 Gate 复测

在 iQOO Neo10 Pro+ (OriginOS) 上重新运行 50 次冷启动测试：

```bash
# 在 Windows 侧（已有 Android SDK）
adb shell am start -a android.intent.action.MAIN -n com.bilingify.readest/.MainActivity

# 等待 App 启动后触发 TTS
adb shell am broadcast -a com.bilingify.readest.V1_GATE_SPEAK \
  --es text "The quick brown fox jumps over the lazy dog"

# 监控 logcat 输出
adb logcat | grep "V1_GATE"
```

**成功标准：**
- 成功率 ≥ 95%（原测试 22.9%）
- p95 延迟 ≤ 2.5 秒（原测试 2.1 秒）

### 可选：用户体验优化

1. **首次使用引导**（设计文档第 80-84 行）
   - 首次点击播放时显示提示：
     > "为确保播放稳定，朗读期间请保持 Readest 在前台或锁屏播放。"
   - 实现位置：`TTSSessionManager.ts` 或 `useTTSControl.ts`

2. **通知权限说明**
   - 当前在 `mediaSession.ts:172` 静默请求
   - 可添加更友好的权限说明对话框

---

## 验证清单

### ✅ 代码验证

- [x] `MediaPlaybackService.kt` 实现前台服务
- [x] `NativeTTSPlugin.kt` 提供 `set_media_session_active` 命令
- [x] `ttsMediaBridge.ts` 在 TTS 播放时激活前台服务
- [x] `TTSSessionManager.ts` 正确调用 `ttsMediaBridge.bind()`
- [x] `AndroidManifest.xml` 声明所有必需权限
- [x] `AndroidManifest.xml` 正确注册 `MediaPlaybackService`

### ⏳ 设备测试（待执行）

- [ ] iQOO Neo10 Pro+ (OriginOS) 冷启动测试
- [ ] 前台播放功能测试
- [ ] 锁屏控制测试
- [ ] 音频焦点切换测试
- [ ] 耳机拔出测试

---

## 技术细节

### 前台服务类型

- **类型：** `FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK`
- **Android 版本：** Android 10 (API 29) 及以上
- **通知重要性：** `IMPORTANCE_LOW`（不打扰用户，但保持前台）
- **通知 ID：** `1002`

### 音频焦点策略

- **焦点类型：** `AUDIOFOCUS_GAIN`
- **内容类型：** `CONTENT_TYPE_SPEECH`
- **鸭音策略：** `setWillPauseWhenDucked(true)` — 暂停而非降低音量

### OriginOS 限流绕过机制

OriginOS 的"异常行为检测"会屏蔽重复后台启动的 TTS 服务绑定。前台服务绕过方式：

1. **前台上下文：** `startForegroundService()` 提升为前台服务
2. **系统豁免：** 前台服务不受后台限流影响
3. **持久通知：** 通知栏显示播放状态，用户可见性高

---

## 参考文档

- 原始设计：`docs/v1/degradation-foreground-playback.md`
- V1 Gate 报告：`docs/v1/v1-report.md`
- 详细分析：`docs/v1/foreground-playback-implementation-status.md`
