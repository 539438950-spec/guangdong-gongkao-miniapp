# 广东公考小程序

聚焦广东公考公告聚合、岗位检索、岗位对比的数据型微信小程序 MVP。

## 目录

- `apps/weapp`：微信小程序前端
- `services/ingest`：公告与岗位表采集、解析、校验、发布
- `services/api`：给小程序提供远端数据访问的服务层
- `packages/shared`：共享模型、规则和测试
- `docs`：架构与数据源说明

核心文档：

- `docs/product-plan.md`：产品定位、竞品对标、岗位对比与上线边界
- `docs/architecture.md`：整体架构与数据流
- `docs/sources.md`：首版数据源与接入边界

## 当前范围

- 官方公告聚合
- 结构化岗位列表
- 岗位对比与规则推荐
- 收藏、订阅、浏览记录、站内消息
- 采集异常告警、复核队列、稳定版本回退

当前前端页面：

- 首页
- 公告列表 / 公告详情
- 岗位列表
- 岗位对比
- 消息中心
- 数据源状态
- 复核中心
- 我的

当前不做：

- 题库、课程、模考、直播
- 经验社区
- 全国全量来源激进抓取

## 运行

### 共享与采集测试

```powershell
node --test packages/shared/test/*.test.js services/ingest/test/*.test.js
```

### 小程序与 API 测试

```powershell
node --test apps/weapp/test/*.test.js services/api/test/*.test.js
```

### 单次采集

```powershell
node services/ingest/src/index.js
```

### 定时轮询

```powershell
$env:INGEST_INTERVAL_MS="300000"
node services/ingest/src/index.js --watch
```

### 采集健康报告

```powershell
node scripts/ingest-health-report.js
node scripts/ingest-health-report.js --source rsks-gd --json
```

这个报告会直接读取 `services/ingest/var/`，输出每个来源当前是否适合开放岗位能力、风险标记和下一步处理建议。

### 复核队列处理

```powershell
node services/ingest/src/index.js --resolve-review review-123 --note "已人工核对"
node services/ingest/src/index.js --reopen-review review-123
node services/ingest/src/index.js --resolve-stale-reviews --source-id rsks-gd
```

以上命令会直接更新 `services/ingest/var/` 下的复核记录、告警状态和 `apps/weapp/data/ingested.js` 快照。

## 数据源现状

- `rsks-gd`：已接入真实广东省人事考试网抓取
- `national-bm`：当前仍为演示源，前台会明确标记为“演示”

原因是当前环境无法稳定直连 `bm.scs.gov.cn`，因此没有伪装成真实官方接入。

## 小程序运行

用微信开发者工具打开 `apps/weapp`。

默认走本地 store。也可以在小程序“我的”页里切到远端模式，配置 API 地址并做健康检查。

## 本地 API 服务

启动本地 HTTP 服务：

```powershell
node services/api/src/index.js
```

默认监听 `http://127.0.0.1:3100`，并把用户状态持久化到 `services/api/var/user-state.json`。

也可以自定义：

```powershell
node services/api/src/index.js --port 3200 --snapshot-target C:\\path\\to\\ingested.js --ingest-store-root C:\\path\\to\\services\\ingest\\var
```

## 云函数友好入口

`services/api` 已拆成三层：

- `services/api/src/core.js`：通用请求处理
- `services/api/src/index.js`：常驻 Node HTTP 服务
- `services/api/src/cloud.js`：云函数 / HTTP 网关适配

默认云函数导出在：

- `services/api/src/cloud-function.js`

可对接：

- `GET /health`
- `POST /rpc`

这两个入口与本地 Node 服务共用同一套用户态持久化、快照加载和复核回写逻辑。

如果云网关会自动在路径前加 stage 或函数前缀，可以给云处理入口传 `routeBasePath`，例如 `/prod/gongkao`，这样 `/prod/gongkao/health` 和 `/prod/gongkao/rpc` 也能正常命中。

具体部署步骤见：

- `docs/cloud-deploy.md`

## 小程序环境覆写

默认环境配置在：

- `apps/weapp/env.js`

如果你只想在本机或真机联调时覆盖云网关地址，不想把真实地址提交到仓库，可以新建：

- `apps/weapp/env.local.js`

项目里已经提供示例：

- `apps/weapp/env.local.example.js`

启动时优先级是：

1. 用户在小程序“我的”页保存的连接配置
2. 本地 `env.local.js`
3. 仓库默认 `env.js`
