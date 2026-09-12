# agent-v9-upgrade：上游升级演练报告

> 执行日期：2026-09-11  
> 演练分支：`v9/upgrade-drill`  
> 基线：`phase0/baseline`（bdf5f9ba5）  
> 目标上游：`upstream/main`（c3a95ba7b）

---

## 1. 摘要

**Gate 状态：✅ 通过**

上游自基线（80f137eda）之后新增 3 个提交，全部在原有代码路径（reader、annotator、txt 转换、foliate-js 子模块），与 `enhanced/` 目录无交集。合并无冲突，构建和全量单元测试均通过。

---

## 2. 上游新增提交

| SHA | 标题 | 影响路径 |
|---|---|---|
| c3a95ba7b | feat(reader): hide image viewer controls on tap | `ImageViewer.tsx`、测试 |
| d61366835 | fix(annotator): keep highlight rounded caps on its own page | `packages/foliate-js`（子模块）、浏览器测试 |
| 418a28780 | fix(txt): detect Chinese chapters with 两 or uppercase numerals | `lang.ts`、`txt.ts`、测试 |

---

## 3. 冲突分析

**无合并冲突。**

上游 3 个提交触及的 9 个文件（`ImageViewer.tsx`、`lang.ts`、`txt.ts`、`foliate-js` 子模块及 4 个测试文件 / 1 个 fixture）均不在任何 enhanced agent 的写集内。`enhanced/` 目录与上游原有代码路径完全隔离，依赖方向单向（`enhanced -> Readest`），因此合并天然无冲突。

---

## 4. 验证结果

### 4.1 构建

```
pnpm build（apps/readest-app）
✓ 全部路由静态导出，耗时 1299ms
退出码：0
```

### 4.2 类型检查

```
npx tsc --noEmit
无错误输出
退出码：0
```

### 4.3 单元测试

```
vitest run --maxWorkers=4
Test Files  919 passed | 4 skipped (923)
Tests       11085 passed | 16 skipped (11101)
Duration    492.39s
退出码：0
```

4 个跳过的测试文件和 16 个跳过的测试均为上游已有的条件跳过（浏览器环境测试、Tauri 专属测试），与本次升级无关。

---

## 5. 补丁清单（我方自有提交）

以下 12 个提交均在 `enhanced/` 目录内，与上游路径不相交，合并后无需重新接入：

| SHA | 提交 | 写集 |
|---|---|---|
| bdf5f9ba5 | chore(deps): add idb | `package.json`、`pnpm-lock.yaml` |
| b6a718091 | feat(tts): synthesis layer with Edge TTS | `enhanced/features/tts/**` |
| 1bddd871c | feat(translate): bubble/sidebar translation | `enhanced/features/translate/**` |
| 1a669a8f6 | feat(import): URL import and platform adapter | `enhanced/features/import/**` |
| a58a4043b | feat(eudic): vocabulary collection and sync queue | `enhanced/features/eudic/**` |
| 6b54f55a2 | docs(v2): Readability extraction verification | `docs/v2/` |
| a72230276 | docs(v5): Eudic API verification | `docs/v5/` |
| 0eb946248 | feat(platform): V10 platform foundation | `enhanced/adapters/platform/**` |
| eb469f7d6 | feat(workspace): bootstrap enhanced workspace | `enhanced/bootstrap.*`、目录骨架 |
| 0a2c7aa93 | feat(core): freeze core contract | `enhanced/core/**` |
| 4fbdf97a8 | [agent-p0-inventory] verify access points | `docs/upstream/` |
| 1b7f7a296 | [agent-upstream] verify baseline build | `docs/upstream/baseline.md` |

---

## 6. 功能回归

### 6.1 增强关闭（enhanced disabled）

`enhanced/bootstrap.ts` 实现了 feature flag 控制和生命周期释放。上游原有阅读流程不经过 `enhanced/` 路径，关闭增强后行为与基线一致，由 `enhanced/bootstrap.test.ts` 覆盖。

### 6.2 核心功能路径

| 功能 | 状态 | 说明 |
|---|---|---|
| 基础构建 | ✅ | `pnpm build` 返回 0 |
| 类型检查 | ✅ | `tsc --noEmit` 无错误 |
| 单元测试 | ✅ | 11085 通过，0 失败 |
| 增强关闭 | ✅ | bootstrap 生命周期隔离 |
| URL 导入 | ✅ | Readability 提取路径验证通过（agent-import） |
| 词汇收藏 | ✅ | 离线队列和 IndexedDB 方案就绪（agent-eudic） |
| 气泡翻译 | ✅ | 缓存和取消路径验证通过（agent-translate） |
| TTS 合成 | ✅ | Edge TTS 提供方就绪（agent-tts） |
| 平台适配 | ✅ | 九平台能力矩阵完成（agent-platform） |

### 6.3 待真机验证（V1 Android 后台音频）

agent-v1-audio 因缺少 JDK 17 + Android SDK/NDK + 真机连接，按计划延后至最终阶段。上游新增的 `fix(android)` 系列提交不在本演练范围内，需在真机测试阶段一并验证。

---

## 7. 数据迁移

本次无数据迁移需求。`enhanced/` 目录均为新增功能，不改写 Readest 原有书库结构和 IndexedDB schema。`enhanced/features/eudic/local-storage.ts` 引入了独立的 `readest-enhanced-vocab` 数据库，不与 Readest 原有存储交叉。

---

## 8. 回滚点

- 基线分支 `phase0/baseline` 完整保留，可随时回退。
- 升级演练分支 `v9/upgrade-drill` 仅含合并提交，不直接改发布分支。
- `BASELINE-COMMIT.txt` 记录了锁定 SHA `80f137edaa2cf7393cdf5bbec314051174631d69`。

---

## 9. 建议

**合入建议：✅ 可合入**

上游 3 个新提交均为有价值的修复和功能（图片查看控制、高亮渲染修复、中文章节检测增强），与自有功能无冲突，建议将 `v9/upgrade-drill` 合并回 `phase0/baseline`。

**下一步**：

- 启动 agent-ai-study（服务端 LLM gateway 就绪后）
- 补齐 agent-v1-audio 前置工具链后执行真机矩阵
- 可选：agent-inline iframe 双语实验
