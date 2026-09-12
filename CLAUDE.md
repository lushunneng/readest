# Readest Enhanced — CLAUDE.md

> 此文件是 Claude Code 的项目上下文。Windows 真机测试侧只需阅读「当前任务」和「V1 Gate 测试」两节。

---

## 项目概况

这是 Readest 的 AI 英语阅读平台升级分支，代码全部在 `enhanced/` 目录下，不修改 Readest 原有源码路径。

- **Fork 地址**：`git@github.com:lushunneng/readest.git`
- **当前分支**：`phase0/baseline`
- **基线 SHA**：`80f137edaa2cf7393cdf5bbec314051174631d69`（锁定于 `BASELINE-COMMIT.txt`）
- **真机**：iQOO Neo10 Pro+（Android 16 OriginOS）
- **项目负责人**：lsn

---

## 已完成的工作（Linux 开发机侧，勿重复）

以下 14 个 agent 已在 Linux 开发机完成，代码已推送到 `phase0/baseline`：

| Agent | 状态 | 主要产物 |
|---|---|---|
| agent-upstream | ✅ | `docs/upstream/baseline.md`，基线构建验证 |
| agent-p0-inventory | ✅ | `docs/upstream/access-points.md` |
| agent-core-contract | ✅ | `enhanced/core/ports.ts`，`models.ts` |
| agent-workspace-bootstrap | ✅ | `enhanced/bootstrap.ts`，目录骨架 |
| agent-platform-foundation | ✅ | `docs/platform/`，九平台能力矩阵 |
| agent-v2-wechat | ✅ | `docs/v2/v2-report.md`，Readability 验证 |
| agent-v5-eudic | ✅ | `docs/v5/v5-report.md`，欧路 API 验证 |
| agent-eudic | ✅ | `enhanced/features/eudic/` |
| agent-import-platform | ✅ | `enhanced/features/import/` |
| agent-translate | ✅ | `enhanced/features/translate/` |
| agent-tts | ✅ | `enhanced/features/tts/` |
| agent-v9-upgrade | ✅ | `docs/v9/v9-report.md`，上游升级演练 |
| agent-ai-study | ✅ | `enhanced/features/ai/` |
| agent-inline | ✅ | `enhanced/features/inline/`（实验性，默认关闭）|

---

## 当前任务（Windows 真机测试侧）

**唯一剩余任务：agent-v1-audio（Android 后台音频 V1 Gate）**

你负责在 Windows 11 主机上，使用 iQOO Neo10 Pro+（Android 16 OriginOS）执行真机测试，验证 TTS 后台音频的 V1 Gate 标准。

### V1 Gate 标准（必须全部通过）

- 固定设备：iQOO Neo10 Pro+（Android 16 OriginOS）
- 固定文本：使用 `enhanced/features/tts/test-sample.txt`
- **核心指标：50 次冷启动，首句音频 p95 ≤ 15 秒**
- 附加场景：锁屏 30 分钟连续播放、通知栏控制、蓝牙切换、断网恢复、进程回收后恢复、OriginOS 后台限制

### 失败处理

V1 Gate 失败时不阻塞项目，按以下优先级选择降级方案，由 lsn 决策：
1. 前台播放（用户保持应用前台）
2. 预下载后播放（先缓存音频再播放）
3. 纯阅读模式（不含 TTS）

---

## 工具链前置要求（Windows 侧）

在执行构建前，确认以下工具全部就绪：

```powershell
java -version          # 需要 JDK 17
adb devices            # 需要 Android SDK Platform-Tools，设备已连接
rustup target list --installed  # 需要包含 aarch64-linux-android
echo $env:ANDROID_HOME # 需要指向 Android SDK 目录
echo $env:NDK_HOME     # 需要指向 NDK 目录
pnpm -v                # 需要 pnpm
```

---

## 构建命令（Windows PowerShell）

```powershell
# 在仓库根目录
pnpm install --frozen-lockfile

# 生成必要的 vendor 文件
cd apps/readest-app
pnpm setup-vendors

# 构建 Android debug APK
pnpm tauri android build --debug

# 安装到已连接设备
adb install -r src-tauri/gen/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 仓库结构（关键路径）

```
readest-fork/
├── apps/readest-app/          # Next.js + Tauri 主应用
│   ├── src/                   # Readest 原有源码，尽量不改
│   └── src-tauri/             # Tauri Android 构建入口
├── enhanced/                  # 所有自有功能，与上游隔离
│   ├── core/                  # 冻结契约（ports.ts, models.ts），只读
│   ├── features/              # 各功能模块
│   │   ├── tts/               # TTS 合成层（V1 Gate 相关）
│   │   ├── eudic/             # 欧路词汇
│   │   ├── import/            # URL 导入
│   │   ├── translate/         # 翻译
│   │   ├── ai/                # AI 学习辅助
│   │   └── inline/            # 内联双语（实验性）
│   ├── adapters/              # 平台适配器
│   └── bootstrap.ts           # feature flag 入口
├── docs/                      # 各 agent 报告
│   ├── tts/implementation-report.md   # TTS 实现报告（V1 Gate 参考）
│   └── v9/v9-report.md                # 上游升级演练报告
└── BASELINE-COMMIT.txt        # 锁定基线 SHA
```

---

## 重要约束

- `enhanced/core/` 已冻结，**不得修改**。
- 不修改 `packages/foliate-js/` 子模块。
- 不在客户端存储长期 token、密码或支付密钥。
- 不绕过登录、关注、付费、验证码或反爬机制。
- 构建脚本在 `apps/readest-app`，仓库根无 `build` 脚本。
- `public/vendor` 不在版本控制，须先运行 `pnpm setup-vendors`。

---

## 测试命令

```powershell
# 单元测试（在 apps/readest-app 目录）
pnpm test:pr:web:unit

# 类型检查
npx tsc --noEmit

# 仅运行 TTS 相关测试
# vitest run enhanced/features/tts/gate-validation.test.ts
```

---

## 产物提交规范

V1 Gate 测试完成后，将原始时间戳和设备日志写入：

```
docs/v1/v1-report.md
```

Commit 格式：

```
docs(v1): Android audio gate report — [pass/fail] p95=Xs

[测试结果摘要]

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

然后推送到 `origin phase0/baseline`。
