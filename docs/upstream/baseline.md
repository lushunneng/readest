# 上游基线固化报告（agent-upstream）

本文档记录 Readest 升级项目 Phase 0 的上游基线锁定与构建验证证据。所有命令均在
`/home/dev/01-Projects/readest-fork` 实际执行，输出为原始摘要，未做美化。

## 1. 基线信息

| 项 | 值 |
| --- | --- |
| 基线 SHA | `80f137edaa2cf7393cdf5bbec314051174631d69` |
| 工作分支 | `phase0/baseline` |
| origin（用户 fork） | `git@github.com:lushunneng/readest.git` |
| upstream（官方） | `https://github.com/readest/readest` |
| 与上游 `main` 的关系 | **完全一致，无落后**（upstream/main 头部 = `80f137edaa2cf7393cdf5bbec314051174631d69`） |
| 应用版本 | `@readest/readest-app@0.12.8` |

`git ls-remote --heads upstream` 只读查询结果（未执行 fetch/merge/rebase）：

```
38ebee5b13dc0d828c126e12183411ef27e1510b	refs/heads/feat/tts-lyric-view-5755
70100af757d77d44f6df709803b4d7eba5331398	refs/heads/fix/image-highlight-page-spill-6128
cfa01584942c19e6188aec891eada8f1545f6173	refs/heads/fix/txt-chapter-cjk-numerals-6172
80f137edaa2cf7393cdf5bbec314051174631d69	refs/heads/main
0d712b0fa70f7f9383df6061127c34533cab2725	refs/heads/update_flake_lock_action
```

## 2. 工具链版本

| 工具 | 命令 | 实际输出 |
| --- | --- | --- |
| Node.js | `node -v` | `v24.19.0` |
| npm | `npm -v` | `12.0.2` |
| pnpm（全局） | `pnpm -v` | `12.3.4` |
| pnpm（实际生效） | `pnpm install` 自报 | `Done in 112ms using pnpm v11.1.1` |
| rustc | `rustc --version` | `rustc 1.98.1 (48a229cea 2026-09-01)` |
| cargo | `cargo --version` | `cargo 1.98.1 (797e8a9bc 2026-08-05)` |
| Rust 工具链 | `rustup show` | `stable-x86_64-unknown-linux-gnu (active, default)`；rustup home `/home/dev/.rustup` |
| Rust targets | `rustup show` | 仅 `x86_64-unknown-linux-gnu` |

**重要约定：执行任何 Rust/Cargo 命令前必须先 `source $HOME/.cargo/env`。**
Rust 安装在 `$HOME/.cargo/bin`，非交互 shell 的 PATH 中取不到，直接调用 `rustc`/`cargo`
会报 `command not found`。本报告中所有 Rust 相关命令均已先 source。

**pnpm 版本差异（需下游注意）**：全局 `pnpm -v` 报告 `12.3.4`，但仓库根
`package.json` 的 `packageManager` 字段固定为 `pnpm@11.1.1`，corepack 会自动降级到
11.1.1 执行。这是预期行为，不要为了消除差异去改 `packageManager` 字段。

## 3. 子模块指针

`git submodule status --recursive` 共 9 行，全部以空格开头（无 `-` 前缀，无 `+` 前缀），
即 8 个一级子模块 + 1 个嵌套子模块全部已检出且与父仓记录的指针一致。

| path | url | commit 指针 | 跟踪引用 |
| --- | --- | --- | --- |
| `packages/foliate-js` | `https://github.com/readest/foliate-js.git` | `98b82a517e8cb9e37f806ac5dca185bc4b35536c` | `heads/main` |
| `packages/tauri` | `https://github.com/readest/tauri.git` | `3156d92b7f0299f71119c127321bee14df71f2cc` | `heads/readest` |
| `packages/simplecc-wasm` | `https://github.com/readest/simplecc-wasm.git` | `5e5b56f5b82394e7df07f9171ac70f4578b24a32` | `heads/master` |
| `packages/simplecc-wasm/OpenCC` **（嵌套子模块）** | 由 `simplecc-wasm` 自身 `.gitmodules` 定义，不在根 `.gitmodules` 中 | `e0d41d7f5e7c62f9be1cfdd9e6cb1d03847c06e7` | `ver.1.1.2-174-ge0d41d7f` |
| `packages/js-mdict` | `https://github.com/readest/js-mdict.git` | `d01bf62af872b1fbeacb2f18446460960e7400de` | `heads/master` |
| `packages/qcms` | `https://github.com/mozilla/pdf.js.qcms.git` | `fc23a407f1ed9ccfea15875d27e0936dcc798a1f` | detached `fc23a40`（无分支跟踪） |
| `apps/readest-app/src-tauri/plugins/tauri-plugin-turso` | `https://github.com/readest/tauri-plugin-turso.git` | `3c4be4fd92fbe11e8e374b6e8e85dbf9a3b1b4ac` | `heads/main` |
| `apps/readest-app/src-tauri/plugins/tauri-plugin-webview-upgrade` | `https://github.com/readest/tauri-plugin-webview-upgrade.git` | `bbb5bd33ef4ab644e915f7264ef15a8da97cb284` | `heads/main` |
| `apps/readest-app/.claude/skills/gstack` | `https://github.com/garrytan/gstack.git` | `a3259400a366593e0c909dd9ac3e59752efd2488` | `remotes/origin/garrytan/fix-autoplan-dual-voice-e2e` |

两点需注意：`packages/qcms` 处于 detached 状态且上游是 mozilla 仓库；
`gstack` 指向的是一个 feature 分支而非 main。二者都是上游 `80f137e` 记录的原始状态，
不要"顺手修正"。

## 4. 命令执行记录

### 4.1 仓库状态

```
git remote -v            → exit 0，origin=fork(SSH)，upstream=readest/readest(HTTPS)
git branch --show-current → exit 0，phase0/baseline
git rev-parse HEAD        → exit 0，80f137edaa2cf7393cdf5bbec314051174631d69
git status --porcelain    → exit 0，仅一行 `?? BASELINE-COMMIT.txt`
```

### 4.2 依赖安装

```
$ pnpm install --frozen-lockfile     # 在仓库根执行
Scope: all 6 workspace projects
Already up to date
Done in 112ms using pnpm v11.1.1
→ exit 0，耗时 2s（依赖此前已装齐，本次为幂等校验）
```

```
$ git diff --stat pnpm-lock.yaml
→ exit 0，输出为空 ⇒ 锁文件零变化
```

### 4.3 生成 vendor 资源

```
$ cd apps/readest-app && pnpm setup-vendors
# 展开为 setup-pdfjs && setup-simplecc && setup-jieba
# 依次复制 pdfjs-dist（worker/wasm/cmaps/standard_fonts）、postcss 展平两个 pdfjs CSS、
# simplecc-wasm dist/web、jieba-wasm pkg/web
→ exit 0，耗时 22s

$ ls public/vendor
jieba
pdfjs
simplecc
```

### 4.4 构建

```
$ cd apps/readest-app && pnpm build      # dotenv -e .env.tauri -- next build
▲ Next.js 16.3.3 (Turbopack)
✓ Compiled successfully in 12.9s
  Finished TypeScript in 3.5s
✓ Generating static pages using 3 workers (23/23) in 1786ms
✓ Exporting using 3 workers (4/4) in 1248ms
→ exit 0，耗时 25s
```

路由数量：**Route (app) 20 条** + **Route (pages) 2 条**，静态预渲染页面 23 个。

app 路由清单：`/`、`/_not-found`、`/auth`、`/auth/callback`、`/auth/error`、
`/auth/recovery`、`/auth/update`、`/gdrive-callback`、`/library`、`/o`、`/offline`、
`/onedrive-callback`、`/opds`、`/player`、`/reader`、`/s`、`/send`、`/updater`、
`/user`、`/user/subscription/success`。
pages 路由清单：`/_app`、`/reader/[ids]`。

构建期非阻塞告警（上游既有状态，非本次引入）：`output: export` 模式下
`rewrites`/`headers` 不生效；`/_next/static/:path*` 存在自定义 `Cache-Control`；
实验项 `proxyClientMaxBodySize`。

### 4.5 类型检查

```
$ cd apps/readest-app && npx tsc --noEmit
→ exit 0，耗时 4s，无类型错误输出
```

### 4.6 单元测试

```
$ cd apps/readest-app && pnpm test:pr:web:unit
# dotenv -e .env -e .env.test.local -- vitest run --maxWorkers=4
 RUN  v4.1.10
 Test Files  919 passed | 4 skipped (923)
      Tests  11078 passed | 16 skipped (11094)
   Duration  374.91s (transform 42.17s, setup 7.56s, import 236.57s,
                      tests 184.85s, environment 829.09s)
→ exit 0，墙钟耗时 378s
```

测试期 stdout 出现一行 jsdom 噪声 `Not implemented: navigation to another Document`，
不影响结果，全部用例通过。**该步骤约需 6-7 分钟，自动化编排时超时请给到 600000 ms 以上。**

## 5. 构建路径与两个坑

1. **构建入口在 `apps/readest-app`，不在仓库根。** 仓库根 `package.json` 没有 `build`
   脚本，其 scripts 只有 `test`/`test:lua`/`lint`/`lint:lua`/`tauri`/`dev-web`/`prepare`/
   `fmt:check`/`clippy:check`/`worktree:new`/`worktree:rm`/`format`/`format:check`。
   在仓库根执行 `pnpm build` 会失败，且这类失败与代码无关，容易被误判为基线损坏。
2. **`apps/readest-app/public/vendor` 不在版本控制内**（被
   `apps/readest-app/.gitignore:68:/public/vendor` 忽略），必须先在 `apps/readest-app`
   执行 `pnpm setup-vendors` 生成 pdfjs/simplecc/jieba 三套资源，否则构建缺文件。
   全新克隆或清理过工作树后都要重跑这一步。

## 6. Gate 判定

| # | 验证项 | 判定 | 证据 |
| --- | --- | --- | --- |
| 1 | `git remote -v` 正确，origin=fork，upstream=readest/readest | **通过** | origin=`git@github.com:lushunneng/readest.git`，upstream=`https://github.com/readest/readest` |
| 2 | `BASELINE-COMMIT.txt` 含一个 40 字符 SHA | **通过** | 去除换行后 `wc -c` = 40，内容 `80f137edaa2cf7393cdf5bbec314051174631d69`，与 HEAD 及 upstream/main 三方一致 |
| 3 | `git submodule status` 无 `-` 前缀，指针可复现 | **通过** | `--recursive` 共 9 行，9 行全部以空格开头；指针见第 3 节 |
| 4 | `pnpm install --frozen-lockfile` 返回 0 且锁文件无变化 | **通过** | exit 0；`git diff --stat pnpm-lock.yaml` 输出为空 |
| 5 | `pnpm setup-vendors` 返回 0，生成 pdfjs/simplecc/jieba | **通过** | exit 0；`ls public/vendor` = jieba、pdfjs、simplecc |
| 6 | `pnpm build` 返回 0 | **通过** | exit 0；20 app 路由 + 2 pages 路由，23 静态页 |
| 7 | `npx tsc --noEmit` 返回 0 | **通过** | exit 0，无错误输出 |
| 8 | `pnpm test:pr:web:unit` 返回 0 | **通过** | exit 0；919 文件通过 / 4 跳过，11078 用例通过 / 16 跳过 |
| 9 | 报告注明 Java/Android 未安装且不影响本 Gate | **通过** | 见第 7 节 |

**Gate 整体结论：9/9 全部通过。**

## 7. 未安装但不影响本 Gate 的项

以下均为实测结果，且**桌面/Web 基线完全不依赖它们**，因此不构成本 Gate 的阻塞项：

| 项 | 实测状态 | 影响范围 |
| --- | --- | --- |
| Java / JDK | `command -v java` 未找到 | 仅 Android 构建需要 |
| Android SDK | `ANDROID_HOME` 未设置 | 仅 Android 构建需要 |
| Android NDK | `NDK_HOME` 未设置 | 仅 Android 构建需要 |
| adb | `command -v adb` 未找到 | 仅 Android 真机/模拟器调试需要 |
| rustup 交叉编译 target | 仅安装 `x86_64-unknown-linux-gnu` | Android 需 `aarch64-linux-android` 等额外 target |

**上述五项统一归属 `agent-v1-audio` 的前置条件**，由该 agent 在需要时自行安装并记录。
本 Gate 与其它桌面/Web 相关 agent 不应因为它们缺失而报阻塞。

## 8. 风险与回退点

**回退 SHA：`80f137edaa2cf7393cdf5bbec314051174631d69`**（分支 `phase0/baseline`）。
任何下游改动出问题，`git reset --hard 80f137e` + `git submodule update --init --recursive`
即可回到本报告验证过的干净状态。注意该操作是破坏性的，执行前需确认无未保存改动。

下游 agent 需注意：

1. **构建路径**：所有构建/类型检查/测试命令都要在 `apps/readest-app` 执行，仓库根无 `build`。
2. **vendor 预生成**：清过工作树或换新 worktree 后，先 `pnpm setup-vendors` 再构建。
3. **Rust 环境**：任何 Cargo/Tauri 命令前先 `source $HOME/.cargo/env`。
4. **锁文件纪律**：`pnpm install` 一律带 `--frozen-lockfile`；`pnpm-lock.yaml`、三个
   `Cargo.lock`（根、`apps/readest-app/extensions/windows-thumbnail`、
   `apps/readest.koplugin/native/localsend-bin`）、`.gitmodules` 均须保持零 diff，
   本次已全部确认无变化。
5. **pnpm 版本**：全局 12.3.4 vs `packageManager` 固定 11.1.1，以后者为准，不要改。
6. **测试耗时**：`test:pr:web:unit` 约 6-7 分钟（本次 374.91s），CI/编排超时须 ≥ 600s。
7. **子模块特殊状态**：`packages/qcms` 为 detached 且上游属 mozilla；`gstack` 指向 feature
   分支。都是上游原始状态，不要"修正"。
8. **未验证范围（本 Gate 未覆盖，不要当作已通过）**：Tauri 原生桌面打包
   （`pnpm tauri build`）、Rust 侧 `clippy:check` / `fmt:check`、E2E 测试、Android 构建、
   Lua 测试（`test:lua`）。本 Gate 只覆盖 Web 构建 + TS 类型检查 + Web 单元测试。

## 9. 构建产物与版本控制

`pnpm install`、`setup-vendors`、`build`、测试均只产生被 `.gitignore` 覆盖的产物，
未产生任何游离的未跟踪文件。逐项 `git check-ignore -v` 确认：

| 路径 | 忽略规则 |
| --- | --- |
| `node_modules` | `.gitignore:5:/node_modules` |
| `apps/readest-app/node_modules` | `apps/readest-app/.gitignore:4:/node_modules` |
| `apps/readest-app/.next` | `apps/readest-app/.gitignore:18:/.next/` |
| `apps/readest-app/out` | `apps/readest-app/.gitignore:19:/out/` |
| `apps/readest-app/public/vendor` | `apps/readest-app/.gitignore:68:/public/vendor` |

全部步骤跑完后 `git status --porcelain` 仍只有 `?? BASELINE-COMMIT.txt` 一行，
证明构建过程没有污染工作树。本次提交只包含 `BASELINE-COMMIT.txt` 与本报告两个文件。
