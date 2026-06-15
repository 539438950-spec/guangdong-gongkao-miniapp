# 广东公考小程序

聚焦广东公考公告聚合、岗位检索、岗位对比的数据型微信小程序 MVP，当前工程已经同时具备：

- 小程序前端主链路
- 官方来源采集、发布、回退、复核链路
- 本地 demo / API / DevTools 联调入口
- 交付检查、分组提交、总包导出与回退工件

## 目录

- `apps/weapp`：微信小程序前端
- `services/ingest`：公告与岗位表采集、解析、校验、发布
- `services/api`：本地 API 与云函数适配层
- `packages/shared`：共享模型、规则和测试
- `docs`：产品、契约、架构、交付文档
- `output`：demo、smoke、audit、delivery 工件

## 当前范围

已做：

- 官方公告聚合
- 结构化岗位列表
- 岗位对比与规则推荐
- 收藏、订阅、浏览记录、站内消息
- 采集异常告警、复核队列、稳定版本回退

当前页面：

- 首页
- 公告列表 / 公告详情
- 岗位列表
- 岗位对比
- 消息中心
- 数据源状态
- 复核中心
- 我的

明确不做：

- 题库、课程、模考、直播
- 经验社区
- 全国全量激进抓取
- 黑盒 AI 选岗推荐

## 文档入口

先按角色选文档：

- `docs/role-guide.md`：总入口，先判断你该走哪条链
- `docs/command-matrix.md`：稳定命令入口，覆盖开发、演示、交付、回退
- `docs/delivery-checklist.md`：交付检查、runtime/基线边界、基线刷新规则

再按分线看细节：

- `docs/product-plan.md`：产品定位、竞品对标、上线边界
- `docs/mvp-contract.md`：总契约
- `docs/frontend-contract.md`：前端执行基线
- `docs/ingest-contract.md`：采集/API/发布执行基线
- `docs/test-matrix.md`：测试与验收基线
- `docs/architecture.md`：整体架构
- `docs/sources.md`：首版来源边界
- `docs/cloud-deploy.md`：云函数部署说明

## 最常用命令

日常回归：

```powershell
npm test
npm run docs:check
npm run runtime:check
npm run mvp:smoke
```

如果本机 PowerShell 执行策略拦截 `npm.ps1`，统一改用：

```powershell
node scripts/run-package-script.js docs:check
node scripts/run-package-script.js runtime:check
node scripts/run-package-script.js mvp:smoke
```

演示与联调：

```powershell
npm run demo:check
npm run demo:start
npm run demo:serve
npm run demo:status
npm run weapp:audit
npm run weapp:smoke
```

采集与基线：

```powershell
npm run ingest:health
npm run baseline:report
npm run baseline:refresh
```

交付与总包：

```powershell
npm run delivery:report
npm run delivery:check
npm run delivery:stage
npm run delivery:plan
npm run delivery:manifest
npm run delivery:bundle:write
```

完整命令说明、推荐顺序和回退入口见 `docs/command-matrix.md`。

## 运行边界

默认本地运行只应写入 runtime 和审计产物，不应直接刷脏提交基线。

提交基线：

- `apps/weapp/data/ingested.js`
- `services/ingest/var/source-states.json`
- `services/ingest/var/position-overrides.json`
- `services/ingest/var/production/**`

本地 runtime / audit：

- `services/ingest/var/runtime/**`
- `services/api/var/runtime/**`
- `output/**`
- `.playwright-cli/**`
- `apps/weapp/env.runtime.js`

只有在确认要提升当前 runtime 为新的显式基线时，才执行 `npm run baseline:refresh`。这条边界的完整规则见 `docs/delivery-checklist.md`。

## 快速判断

如果你只想知道“现在能不能演示”：

1. `npm run mvp:smoke`
2. `npm run weapp:audit`
3. `npm run weapp:smoke`
4. `npm run docs:check`
5. `npm run runtime:check`
6. 看 `output/mvp-smoke/latest.json`、`output/weapp-devtools/latest.json`、`output/docs-entrypoints/latest.json`、`output/runtime-boundaries/latest.json`

如果你只想知道“现在能不能交付”：

1. `npm run delivery:report`
2. `npm run baseline:report`
3. `npm run delivery:check`
4. 如需总包，执行 `npm run delivery:bundle:write`

如果你只想知道“该从哪里看工件”：

- demo：`output/demo-start/**`
- 主链 smoke：`output/mvp-smoke/**`
- 包体审计：`output/weapp-bundle/**`
- DevTools 联调：`output/weapp-devtools/**`
- 交付总包：`output/delivery-bundle/**`

## 数据源现状

- `rsks-gd`：已接入真实广东省人事考试网抓取
- `ggfw-hrss-gd`：已接入广东省人社公共服务入口抓取
- `national-bm`：当前仍为演示源，前台会明确标记为“演示”

## 本地运行补充

- 小程序工程目录：`apps/weapp`
- 默认本地 API：`http://127.0.0.1:3100`
- 如果 `3100` 被占用，本地 API 会自动回退到可用端口
- 环境覆写优先级：
  1. 小程序“我的”页用户保存配置
  2. `apps/weapp/env.local.js`
  3. `apps/weapp/env.js`

更完整的 demo、API、DevTools、云函数说明分别看：

- `docs/command-matrix.md`
- `docs/delivery-checklist.md`
- `docs/cloud-deploy.md`
