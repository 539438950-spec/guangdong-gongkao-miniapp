# 命令矩阵

本文档用于固定仓库当前“可持续开发”阶段的稳定命令入口，避免日常开发、演示联调、交付和回退流程分散在脚本名与历史对话里。

服从：
- `docs/role-guide.md`
- `docs/mvp-contract.md`
- `docs/ingest-contract.md`
- `docs/test-matrix.md`
- `docs/delivery-checklist.md`

本文档面向三类人：
- 日常开发者：需要知道先跑什么、改完怎么验。
- 演示/联调操作者：需要知道 demo、DevTools、本地 API 的最短命令。
- 交付操作者：需要知道交付闸门、dry-run、apply、回退和审计入口。

如果你先不确定自己属于哪一类，先回到：
- `docs/role-guide.md`

## 1. 使用原则

- 默认优先使用 `npm run ...` 暴露的稳定入口，而不是直接记底层脚本路径。
- 如果本机 PowerShell 执行策略拦截 `npm.ps1`，统一改用 `node scripts/run-package-script.js <script>`。
- 需要精确控制参数时，再退回 `node scripts/*.js` 形式。
- 先跑“验收型命令”，再跑“改写型命令”。
- 任何会改写基线、生成提交会话、执行回退的命令，都必须结合审计产物一起看。

## 2. 日常开发

### 最常用入口

| 场景 | 推荐命令 | 说明 |
| --- | --- | --- |
| 全量回归 | `npm test` | 串行跑 `shared -> ingest -> api -> weapp -> scripts` |
| 文档入口校验 | `npm run docs:check` | 校验首页与入口文档的命令、工件和分流入口没有漂移 |
| 运行边界校验 | `npm run runtime:check` | 校验 `.gitignore`、runtime/audit 路径、入口文档边界没有漂移 |
| PowerShell 兜底入口 | `node scripts/run-package-script.js docs:check` | 适用于 `npm.ps1` 被执行策略拦截时 |
| 共享层测试 | `npm run test:shared` | 共享规则、模型、工具测试 |
| 采集层测试 | `npm run test:ingest` | ingest 流水线、发布、复核测试 |
| API 测试 | `npm run test:api` | 本地 API、云函数适配、runtime 同步 |
| 小程序测试 | `npm run test:weapp` | 页面主链路、store、compare 逻辑 |
| 脚本测试 | `npm run test:scripts` | 交付、demo、DevTools、bundle 等工程化脚本 |

### 改完代码后的最小顺序

1. 页面或 store 改动：先跑 `npm run test:weapp`
2. API 或采集改动：再跑 `npm run test:api` / `npm run test:ingest`
3. 涉及 README、入口文档、命令矩阵：先跑 `npm run docs:check`
4. 涉及 `.gitignore`、runtime 路径、交付边界：补跑 `npm run runtime:check`
5. 涉及交付链、demo、目录结构：补跑 `npm run test:scripts`
6. 准备进入可交付状态：跑 `npm run mvp:smoke`

## 3. 演示与联调

### Demo 入口

| 场景 | 推荐命令 | 说明 |
| --- | --- | --- |
| 单次检查 demo | `npm run demo:check` | 校验 `/health`、`/rpc`、`/demo`、`/` 主链 |
| 前台常驻 demo | `npm run demo:start` | 启动本地 API 并做一次浏览器可达性检查 |
| 后台托管 demo | `npm run demo:serve` | 启动受管控 demo 会话，适合长期联调 |
| 查看 demo 状态 | `npm run demo:status` | 优先读最近可访问的受管控会话 |
| 直接打开 demo | `npm run demo:open` | 直接打开当前可访问 demo |
| 停止 demo | `npm run demo:stop` | 停止 `demo:serve` 启动的后台会话 |

### 本地 API / 小程序联调

| 场景 | 推荐命令 | 说明 |
| --- | --- | --- |
| 启动本地 API | `npm run api:start` | 默认 `127.0.0.1:3100`，端口冲突会自动回退 |
| 主链冒烟 | `npm run mvp:smoke` | 统一跑 demo、API、页面回归 |
| 小程序包体审计 | `npm run weapp:audit` | 检查预览上传包体积、ignore 规则、2MB 闸门 |
| DevTools 联调 | `npm run weapp:smoke` | 驱动微信开发者工具 CLI 做 open/auto/preview |
| 文档入口校验 | `npm run docs:check` | 校验 README 与入口文档的命令、工件和分流入口 |

### 联调产物位置

- demo 状态：`output/demo-start/**`
- 主链冒烟：`output/mvp-smoke/**`
- 包体审计：`output/weapp-bundle/**`
- DevTools 联调：`output/weapp-devtools/**`
- 文档入口校验：`output/docs-entrypoints/**`
- 运行边界校验：`output/runtime-boundaries/**`

## 4. 采集与数据发布

| 场景 | 推荐命令 | 说明 |
| --- | --- | --- |
| 单次采集 | `npm run ingest:demo` | 跑一次 ingest 主流程 |
| 定时轮询 | `npm run ingest:watch` | 持续 watch 模式 |
| 采集健康报告 | `npm run ingest:health` | 汇总来源状态、风险和下一步建议 |
| 查看显式基线状态 | `npm run baseline:report` | 对比提交基线与 runtime 是否同步 |
| 刷新显式基线 | `npm run baseline:refresh` | 把当前 runtime 回写成提交基线 |

### 复核与覆盖动作

这些场景目前保留底层脚本入口：

- 解决单条复核：`node services/ingest/src/index.js --resolve-review review-123 --note "已人工核对"`
- 重新打开复核：`node services/ingest/src/index.js --reopen-review review-123`
- 批量关闭过期复核：`node services/ingest/src/index.js --resolve-stale-reviews --source-id rsks-gd`

## 5. 交付与提交会话

### 先验收，再执行

| 场景 | 推荐命令 | 说明 |
| --- | --- | --- |
| 工作区分类 | `npm run delivery:report` | 看改动落在源码/文档/基线/其他哪一类 |
| 交付闸门检查 | `npm run delivery:check` | 汇总 `mvp:smoke`、`weapp:audit`、`weapp:smoke`、`docs:check`、`runtime:check` |
| 分组建议 | `npm run delivery:stage` | 输出 `frontend / platform / docs / baseline` 分组 |
| 导出分组工件 | `npm run delivery:write` | 生成 stage/commit 工件 |
| 顺序计划 | `npm run delivery:plan` | 输出验收 -> baseline -> 分组提交顺序 |
| 导出顺序计划 | `npm run delivery:plan:write` | 写到 `output/delivery-plan/` |
| 查看 manifest | `npm run delivery:manifest` | 输出完整步骤、脚本、文件清单 |
| 导出 manifest | `npm run delivery:manifest:write` | 写到 `output/delivery-manifest/` |

### Dry-run / Apply / 回退

| 场景 | 推荐命令 | 说明 |
| --- | --- | --- |
| 交付 dry-run | `npm run delivery:execute -- --all-required` | 不改仓库，只打印执行计划 |
| 单组 stage-only | `npm run delivery:execute -- --step frontend --stage-only --apply` | 只执行 stage 段 |
| 提交会话 | `npm run delivery:session -- --step frontend --apply --write-audit` | 生成可审计 commit 会话 |
| 恢复 index | `npm run delivery:restore -- --audit output/delivery-execute/latest.json --target before` | 按 execute/session 审计恢复 index |
| 回退会话 commit | `npm run delivery:revert -- --audit output/delivery-session/latest.json` | 基于 session 审计执行 `git revert` |

## 6. 交付总包

| 场景 | 推荐命令 | 说明 |
| --- | --- | --- |
| 生成总包 | `npm run delivery:bundle:write` | 生成当前可交付总包 |
| 跳过 smoke 生成总包 | `node scripts/delivery-bundle.js --skip-smoke --write` | 只适合明确知道自己在绕过闸门时使用 |

### 总包入口层

- `output/delivery-bundle/README.txt`
- `output/delivery-bundle/RUNBOOK.txt`
- `output/delivery-bundle/QUICKSTART.txt`

### 总包机器工件层

- `output/delivery-bundle/artifacts/bundle.json`
- `output/delivery-bundle/artifacts/check.json`
- `output/delivery-bundle/artifacts/baseline-report.json`
- `output/delivery-bundle/artifacts/manifest/**`
- `output/delivery-bundle/artifacts/execute-audit/**`
- `output/delivery-bundle/artifacts/session-audit/**`
- `output/delivery-bundle/artifacts/weapp-bundle-audit/**`
- `output/delivery-bundle/artifacts/weapp-devtools-audit/**`
- `output/delivery-bundle/artifacts/runtime-boundaries-audit/**`

## 7. 云函数与镜像

| 场景 | 推荐命令 | 说明 |
| --- | --- | --- |
| 同步云函数镜像 | `npm run cloud:sync` | 同步 `services/api` 云函数镜像与 runtime 依赖 |

## 8. 命令选择建议

### 只想知道“现在能不能演示”

1. `npm run mvp:smoke`
2. `npm run weapp:audit`
3. `npm run weapp:smoke`
4. `npm run docs:check`
5. `npm run runtime:check`
6. `npm run delivery:check`

### 只想知道“现在能不能交付”

1. `npm run delivery:report`
2. `npm run baseline:report`
3. `npm run delivery:check`
4. `npm run delivery:manifest`
5. `npm run delivery:bundle:write`

### 只想知道“怎么回退”

1. 看 `output/delivery-bundle/RUNBOOK.txt`
2. 看 `output/delivery-bundle/artifacts/manifest/OPERATOR.txt`
3. 再执行 `npm run delivery:revert -- --audit output/delivery-session/latest.json`

## 9. 禁止事项

- 不要把 `baseline:refresh` 当成日常运行命令；只有确认需要提交显式基线时才执行。
- 不要在未看 `delivery:check` 结果时直接做 `delivery:session --apply`。
- 不要把 demo/runtime/审计产物当成提交基线文件手动移动覆盖。
- 不要跳过 `RUNBOOK.txt` / `QUICKSTART.txt` 直接在总包根目录里盲点脚本。
