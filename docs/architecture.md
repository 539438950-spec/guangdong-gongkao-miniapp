# 架构说明

## 前端

- 使用原生微信小程序
- 当前包含：首页、公告列表、公告详情、岗位列表、岗位对比、数据源状态、复核中心、消息中心、我的
- 默认保留本地 store，方便离线演示和开发阶段自测
- 小程序业务调用统一走 `apps/weapp/utils/api.js`
- 本地模式直接调用 `apps/weapp/utils/api-handlers.js`
- 远端模式通过 HTTP 调 `services/api`

## API 服务

`services/api` 现在分三层：

- `src/core.js`
  - 通用请求处理层
  - 负责 health/rpc 路由分发
  - 负责用户态加载与持久化
  - 负责把复核动作回写到 ingest 存储和快照
- `src/index.js`
  - 常驻 Node HTTP 服务入口
  - 适合本机开发、局域网联调、独立部署
- `src/cloud.js`
  - 云函数 / HTTP 网关适配层
  - 适合接入微信云开发、云函数网关或其他 Serverless HTTP 入口
  - 支持通过 `routeBasePath` 处理网关自动追加的路径前缀
- `src/cloud-function.js`
  - 默认云函数导出文件

## 采集服务

- `services/ingest/src/adapters/`
  - 每个来源一个独立 adapter
- `services/ingest/src/core/`
  - 抓取、解析、校验、发布主流程
- `services/ingest/src/storage/`
  - 原始数据、中间状态、复核队列、告警、发布状态
- `services/ingest/src/publish/`
  - 把通过校验的数据导出到小程序快照

## 数据流

1. 采集服务轮询官方来源
2. 原始页面和附件先落盘
3. 公告与岗位表分别解析
4. 结构化结果进入校验
5. 校验通过的数据进入发布快照
6. 小程序本地模式直接读取快照
7. 小程序远端模式通过 `services/api` 读取同一份快照
8. 复核动作会回写 ingest 存储，并刷新前台读取结果

## 当前关键取舍

- 广东优先，先把少量官方源做深做准
- 岗位对比是正式能力，不是附属功能
- 数据稳定性优先于来源覆盖率
- 国考真实抓取未稳定前，明确保持演示源标记
