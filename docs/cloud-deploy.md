# 云函数部署说明

这份说明对应当前仓库里已经准备好的云函数骨架：

- 小程序目录：`apps/weapp`
- 云函数目录：`cloudfunctions/gongkao-api`
- 远端 API 入口：`cloudfunctions/gongkao-api/index.js`

## 目标

把当前仓库里的公告、岗位、对比、复核 API 以微信云函数 HTTP 触发方式跑起来，并让小程序远端模式连到云端。

## 1. 生成云函数运行时镜像

在仓库根目录执行：

```powershell
node scripts/sync-cloudfunction.js
```

或者：

```powershell
npm run cloud:sync
```

如果本机 PowerShell 执行策略拦截 `npm.ps1`，直接用 `node scripts/sync-cloudfunction.js` 即可。

生成后关键目录如下：

- `cloudfunctions/gongkao-api/index.js`
- `cloudfunctions/gongkao-api/package.json`
- `cloudfunctions/gongkao-api/runtime/`
- `cloudfunctions/gongkao-api/runtime-manifest.json`

`runtime/` 里会镜像当前云函数运行所需的最小代码和数据，包括：

- `services/api/src`
- `apps/weapp/utils`
- `apps/weapp/data`
- `services/ingest/var/production`
- `services/ingest/var/review`
- `services/ingest/var/alerts`

## 2. 打开微信开发者工具

用微信开发者工具打开：

- `apps/weapp`

当前项目配置里已经声明：

- `miniprogramRoot: ./`
- `cloudfunctionRoot: ../../cloudfunctions`

也就是开发者工具会直接识别当前仓库下的 `cloudfunctions/` 目录。

## 2.5 配置本地默认网关地址

如果你已经拿到了云函数网关地址，建议不要直接改 `apps/weapp/env.js`，而是在本机新建：

- `apps/weapp/env.local.js`

可以直接从下面的示例复制：

- `apps/weapp/env.local.example.js`

例如：

```js
module.exports = {
  apiMode: "remote",
  apiBaseUrl: "https://your-gateway.example.com/gongkao",
  apiDefaultLabel: "云函数网关"
};
```

这个文件已经加入 `.gitignore`，适合本地和真机联调使用。

## 3. 配置云开发环境

在微信开发者工具里：

1. 选择或创建云开发环境
2. 给当前小程序项目绑定该环境
3. 在云函数面板里找到 `gongkao-api`
4. 上传并部署 `gongkao-api`

如果你走的是 HTTP 触发器或云托管网关，需要为函数暴露一个可访问 URL。

## 4. 路由约定

当前函数支持两个入口：

- `GET /health`
- `POST /rpc`

如果你的网关会自动追加路径前缀，比如：

- `/prod/gongkao/health`
- `/prod/gongkao/rpc`

可以在云函数入口配置 `routeBasePath`，当前代码已经支持这种前缀路由。

## 5. 小程序连接云端

部署完成后，在小程序“我的”页：

1. 切到“远端模式”
2. 选择“云端环境”预设，或者直接输入你的网关地址
3. 保存配置
4. 执行“检测连接”

成功后，监控页和复核页顶部会显示当前连接环境，便于区分本地快照和云端 API。
同时会显示“配置来源”，用于区分当前配置来自项目默认值还是用户手动保存。

## 6. 数据来源说明

当前云函数镜像带的是仓库里的现有快照和 ingest 状态：

- `apps/weapp/data/ingested.js`
- `services/ingest/var/production`
- `services/ingest/var/review`
- `services/ingest/var/alerts`

这意味着首轮部署更像“把当前稳定数据带上云端”。

如果后面要做真正的在线更新，有两条路：

1. 保持采集服务独立运行，再把最新快照同步到云函数或对象存储
2. 把采集链路继续拆分，单独部署到云托管/定时任务体系

当前仓库已经完成的是第一步之前的 API 云端承接层。

## 7. 重新同步的时机

出现下面任一情况，都应该重新执行一次：

- 修改了 `services/api/src`
- 修改了 `apps/weapp/utils`
- 修改了 `apps/weapp/data`
- 修改了 `services/ingest/src/review-actions.js`
- 修改了 `services/ingest/var/production`、`review`、`alerts`

命令仍然是：

```powershell
node scripts/sync-cloudfunction.js
```

## 8. 当前边界

这套云函数骨架解决的是“小程序远端 API 上云”问题，不等于采集服务本身已经云原生化。

当前还没有一起打包进云函数的能力：

- 定时抓取调度器
- 附件解析脚本运行环境
- 大规模原始页面与附件存储

这些仍建议保留在独立 ingest 服务侧。
