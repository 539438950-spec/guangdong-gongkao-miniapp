# 交付检查清单

本文档用于约束当前仓库进入“可演示、可联调、可提交”状态前的最小动作集合。

服从：
- `docs/role-guide.md`
- `docs/mvp-contract.md`
- `docs/frontend-contract.md`
- `docs/ingest-contract.md`
- `docs/test-matrix.md`
- `docs/command-matrix.md`

如果你先要判断“该跑哪个命令”，优先看：
- `docs/role-guide.md`
- `docs/command-matrix.md`

## 1. 运行边界

默认本地运行写入：
- `services/ingest/var/runtime/**`
- `services/api/var/runtime/**`

默认不应直接写入：
- `apps/weapp/data/ingested.js`
- `services/ingest/var/source-states.json`
- `services/ingest/var/production/**`

这些路径属于“提交基线”，只有在明确刷新基线时才允许变化。

## 2. 日常验证

提交前至少执行：

```powershell
C:\Program Files\nodejs\npm.cmd run mvp:smoke
```

如果这次改动涉及 `README.md`、`docs/role-guide.md`、`docs/command-matrix.md`、`docs/delivery-checklist.md` 这些入口层文档，先补跑：

```powershell
C:\Program Files\nodejs\npm.cmd run docs:check
```

如果这次改动涉及 `.gitignore`、`services/runtime-paths.js`、demo/runtime 目录边界、交付总包入口，也要补跑：

```powershell
C:\Program Files\nodejs\npm.cmd run runtime:check
```

该命令覆盖：
- `demo-start --check --no-ingest`
  覆盖 `/health`、`/rpc listNotices`、`/rpc getDashboard`、`/rpc listSourceStates`、`/rpc listReviewQueue`、`/rpc getNoticeDetail`、`/rpc listPositionsByNotice`、`/rpc listCompareGroups`、`/rpc getCompareGroupDetail`、`/`、`/demo`
  成功后会写 `output/demo-start/latest.json` 和 `latest-check.json`，用于记录检查会话的实际端口、浏览器 demo 地址和主链验收摘要；不会再覆盖最近一次常驻 demo 的专用别名
- `demo-start`
  常驻模式会额外临时写 `apps/weapp/env.runtime.js`，把当前真实本机 API 地址桥接给小程序项目默认连接；新一轮启动前会先清旧文件，正常退出也会清理，不应进入提交基线
- `demo-serve`
  后台启动一个受管控的本地 demo 会话，写入 `output/demo-start/managed-session.json`、`serve.stdout.log`、`serve.stderr.log`；默认复用已有存活会话，必要时可用 `--restart` 重启
- `demo-status`
  默认优先挑选可访问的 `output/demo-start/latest-serve.json`，如果常驻会话已失活再回退到 `latest.json` 或 `latest-check.json`，并在输出里标明 `reachable`
- `demo-status --open`
  按同样优先级读取最近一次可访问 `demoUrl` 并直接打开浏览器，不需要手动翻日志或 `latest.json`
- `demo-stop`
  停止最近一次 `demo-serve` 管理的后台会话，并清理 `managed-session.json` 与 `apps/weapp/env.runtime.js`
- `services/api/test/*.test.js`
- `apps/weapp/test/api.test.js`
- `apps/weapp/test/pages.test.js` 主链路页回归
- `scripts/test/*.test.js`
  覆盖 `delivery-check`、`delivery-bundle`、`delivery-session`、`demo-*`、`weapp:*` 这类交付与运行环境脚本，避免默认测试入口漏掉工程化回归
- `delivery-check`
  会把 `mvp:smoke`、`weapp:audit`、`weapp:smoke`、`docs:check`、`runtime:check` 五道门串起来执行，并汇总 `output/mvp-smoke/latest.json`、`output/weapp-bundle/latest.json`、`output/weapp-devtools/latest.json`、`output/docs-entrypoints/latest.json`、`output/runtime-boundaries/latest.json` 的最新审计。
  只有 `readyForReview=true` 才表示当前工作树可以进入交付步骤；也就是主链路、包体阈值、DevTools 联调、入口文档一致性、运行产物边界同时通过。
- `weapp:smoke`
  默认先确保受管控的本地 `demo:serve` 会话可用，再驱动微信开发者工具 CLI；如 IDE server 已在其他端口运行，会自动回退复用现有端口。每次执行都会写 `output/weapp-devtools/latest.json` 和 `README.txt`，记录 CLI 路径、实际 IDE 端口、open/auto/preview 结果和当前 demo 地址。`compile-ok-upload-blocked` 既包括 AppID/权限拦截，也包括 `80051 source size exceed max limit 2MB` 这类微信侧上传限制；`upload-failed` 表示本地编译后进入上传阶段，但上传过程本身失败。
- `weapp:audit`
  写 `output/weapp-bundle/latest.json` 和 `README.txt`，显式审计 DevTools preview 上传包的 included / ignored 体积、最大文件和 2MB 阈值状态。当前默认忽略 `apps/weapp/data/ingested.js`、`apps/weapp/test/**` 和本机私有的 `apps/weapp/project.private.config.json`，因此小程序运行时默认本地轻量种子是 `data/demo.js`，完整结构化基线继续留给 Node 测试和 API 本地种子，而 DevTools 私有配置不会混进交付审计。
- `runtime:check`
  写 `output/runtime-boundaries/latest.json` 和 `README.txt`，静态校验 `.gitignore`、`README.md`、`docs/command-matrix.md`、`docs/delivery-checklist.md`、`services/runtime-paths.js` 对 runtime/audit 与显式 baseline 的边界定义没有漂移。

交付闸门补充：
- `delivery-check` / `delivery-bundle` 只把 `preview-success` 和 `compile-ok-upload-blocked` 视为可放行的 `weapp:smoke` 结果。
- `delivery-check` / `delivery-bundle` 还要求 `runtime:check` 通过，否则即使 smoke 通过也不能进入 `readyForReview`。
- `unknown`、`compile-failed`、`upload-failed` 都应直接阻断 `readyForReview`。

如果要验证云函数镜像和 runtime 路径助手，可补跑：

```powershell
node --test services/api/test/cloud-sync.test.js services/api/test/runtime-paths.test.js
```

默认全量入口也应覆盖这些核心回归：

```powershell
npm test
```

建议把它作为仓库默认第一道回归门。当前实现会按 `shared -> ingest -> api -> weapp -> scripts` 串行执行，避免脚本测试和 demo/DevTools 临时会话在同一测试进程里互相影响。

## 3. 基线刷新

如果确认当前 runtime 状态应成为新的提交基线，显式执行：

```powershell
node scripts/refresh-baseline.js
```

或者：

```powershell
C:\Program Files\nodejs\npm.cmd run baseline:refresh
```

该动作会覆盖：
- `apps/weapp/data/ingested.js`
- `services/ingest/var/source-states.json`
- `services/ingest/var/position-overrides.json`
- `services/ingest/var/production/**`

不要在未确认 smoke 通过前刷新基线。

如果要先判断显式基线是否应该提交，执行：

```powershell
node scripts/baseline-report.js
```

该命令会逐项比对提交基线与 `runtime/` 的映射文件，告诉你当前是同步、漂移还是缺失。

如果要把当前工作区改动拆成可提交的分组，先执行：

```powershell
node scripts/delivery-stage.js
```

该命令会按 `frontend / platform / docs / baseline` 输出建议提交顺序，并给出可直接执行的 `git add` 命令。

如果只想处理其中一组，可以：

```powershell
node scripts/delivery-stage.js --group frontend
```

如果要把建议分组导出成可执行工件，直接执行：

```powershell
node scripts/delivery-stage.js --write
```

默认会写到 `output/delivery-stage/`，包含：
- `plan.json`
- `README.txt`
- 每个分组对应的 `stage/commit` 脚本（`.cmd` 和 `.sh`）

如果要进一步把“验收 -> baseline 判断 -> 分组提交”串成统一顺序计划，执行：

```powershell
node scripts/delivery-plan.js
```

如果要导出这份顺序计划工件，执行：

```powershell
node scripts/delivery-plan.js --write
```

默认会写到 `output/delivery-plan/`，包含：
- `plan.json`
- `README.txt`
- `sequence.cmd`
- `sequence.sh`

如果要把“顺序计划 + 精确文件清单 + 分步脚本”一起导出，执行：

```powershell
node scripts/delivery-manifest.js --write
```

默认会写到 `output/delivery-manifest/`，包含：
- `manifest.json`
- `README.txt`
- `OPERATOR.txt`
- `sequence.cmd`
- `sequence.sh`
- `sequence-execute-dry-run.cmd`
- `sequence-execute-dry-run.sh`
- `sequence-session.cmd`
- `sequence-session.sh`
- `sequence-revert.cmd`
- `sequence-revert.sh`
- `steps/*.files.txt`
- `steps/*.cmd`
- `steps/*.sh`

说明：
- `sequence.cmd` / `sequence.sh` 走原始 `stage + commit` 顺序。
- `sequence-execute-dry-run.cmd` / `sequence-execute-dry-run.sh` 走带审计的 `delivery-execute` dry-run 顺序。
- `sequence-session.cmd` / `sequence-session.sh` 走带审计的 `delivery-session` 顺序。
- `sequence-revert.cmd` / `sequence-revert.sh` 按分组逆序执行对应的 `delivery-revert`。
- 每个可提交分组会额外生成 `steps/*.execute-dry-run.cmd`、`steps/*.execute-dry-run.sh`、`steps/*.execute-apply-stage.cmd`、`steps/*.execute-apply-stage.sh`、`steps/*.execute-apply-commit.cmd`、`steps/*.execute-apply-commit.sh`、`steps/*.session.cmd`、`steps/*.session.sh`、`steps/*.revert.cmd` 和 `steps/*.revert.sh`。
- 建议先看 `OPERATOR.txt`，再决定是否直接执行整体验证顺序，还是只做某一组 dry-run / apply / revert。

如果要基于当前工作树直接做交付步骤 dry-run，执行：

```powershell
node scripts/delivery-execute.js --all-required
```

默认只打印执行计划，不会修改仓库。只有显式加上 `--apply` 才会真的运行命令。
`--apply` 会先跑一次 `delivery-check`，只有 `readyForReview=true` 时才继续。
如果你明确要绕过这个闸门，再手动加 `--force`。
如果要把这次 dry-run / apply 的结果留成审计工件，再额外加 `--write-audit`。
默认会写到 `output/delivery-execute/`，生成一份时间戳 JSON 和 `latest.json`。
审计里的 `workspacePreflight` 会汇总本次选中文件、当前工作区变更、当前 staged 文件，以及“选中范围外仍有改动/已 staged”的风险摘要，适合在真正 `--apply` 前做最后确认。
例如，只 stage 前端组：

```powershell
node scripts/delivery-execute.js --step frontend --stage-only --apply
```

如果要把 index 恢复到某次 execute audit 记录的 `before` 或 `after` 状态，先 dry-run：

```powershell
node scripts/delivery-restore.js --audit output/delivery-execute/latest.json --target before
```

只有显式加上 `--apply` 才会真的执行 `git read-tree` 改写当前 index。

如果要恢复某次 `delivery-session` 会话的 index 状态，可以直接执行：

```powershell
node scripts/delivery-restore.js --audit-kind session --target before
```

如需显式指定某份 session audit：

```powershell
node scripts/delivery-restore.js --audit-kind session --audit output/delivery-session/latest.json --target after
```

恢复输出会显示 session 审计中的 `headBefore` / `headAfter`，用于辅助判断；但恢复动作本身只改 index，不移动 `HEAD`。

如果要非破坏性地回退某次 `delivery-session` 已生成的 commit，可以执行：

```powershell
node scripts/delivery-revert.js --apply
```

如需显式指定某份 session audit：

```powershell
node scripts/delivery-revert.js --audit output/delivery-session/latest.json
```

这个流程底层使用 `git revert`，会按 session audit 中记录的 commit 逆序生成回退提交，不改写历史。

如果要把选中的交付步骤真正落成“提交会话”，执行：

```powershell
node scripts/delivery-session.js --step frontend --apply --write-audit
```

会话模式额外约束：
- 默认要求 index 为空，避免把无关 staged 文件混进 commit。
- 审计会记录 `HEAD` 前后状态、commit SHA、提交主题和恢复提示。
- 默认写到 `output/delivery-session/`，生成时间戳 JSON 和 `latest.json`。
- 审计里的 `workspacePreflight` 会保留会话开始时的工作区摘要，帮助判断当前 commit 会不会夹带选中范围外的改动。
- 确实需要保留既有 staged 文件时，才显式加 `--allow-prestaged`。

如果要把 `check + baseline + stage + plan` 一次性打成完整交付总包，执行：

```powershell
node scripts/delivery-bundle.js --write
```

默认会写到 `output/delivery-bundle/`，包含：
- `README.txt`
- `RUNBOOK.txt`
- `QUICKSTART.txt`
- `artifacts/bundle.json`
- `artifacts/check.json`
- `artifacts/baseline-report.json`
- `artifacts/stage/**`
- `artifacts/plan/**`
- `artifacts/manifest/**`
- `artifacts/execute-audit/**`
- `artifacts/session-audit/**`
- `artifacts/weapp-bundle-audit/**`
- `artifacts/weapp-devtools-audit/**`
- `artifacts/runtime-boundaries-audit/**`

说明：
- `artifacts/session-audit/**` 会收集 `output/delivery-session/` 下当前存在的全部 JSON。
- 如果已经执行过带 `--audit-alias` 的分组 session，这里也会带上对应的 alias 审计文件。
- `artifacts/check.json` 会直接带上 `weappAudit`、`weappSmoke` 和 `readyForReview` 摘要，便于判断这份总包是否可审阅。
- 建议先看 `RUNBOOK.txt`，它会把演示、联调、交付、回退和审计位置收敛成单页流程。
- 建议先看 `QUICKSTART.txt`，它会把演示、总体验证、分组 apply 和回退入口收敛成最短路径；如需细看分组脚本与文件边界，再进入 `artifacts/manifest/OPERATOR.txt` 与 `artifacts/manifest/README.txt`。

## 4. 工作区判断

看到以下目录脏，不作为异常：
- `services/ingest/var/runtime/**`
- `services/api/var/runtime/**`
- `output/**`
- `.playwright-cli/**`

这些都应被 `.gitignore` 屏蔽。

看到以下路径脏，需要人工判断是否准备提交：
- `apps/weapp/**`
- `services/api/src/**`
- `services/ingest/src/**`
- `packages/shared/**`
- `docs/**`
- 提交基线路径

## 5. 交付出口

满足以下条件才算当前迭代可交付：

1. `mvp:smoke` 通过。
2. 关键 API / ingest / pages 回归通过。
3. 默认 demo / ingest / review 不再误写提交基线。
4. 如需更新基线，必须通过显式刷新脚本完成。
5. `git status --short` 中的脏文件可以被解释为“源码改动 / 文档改动 / 显式基线刷新”，而不是运行期污染。
