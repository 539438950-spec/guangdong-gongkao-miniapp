# 文档导航

本文档用于把当前仓库中已经存在的产品、前端、采集、测试、演示、交付文档按角色重新收拢，避免新接手的人只能靠文件名猜入口。

服从：
- `docs/mvp-contract.md`
- `docs/command-matrix.md`
- `docs/delivery-checklist.md`

本文档不新增业务规则，只负责回答一件事：

- 我现在的角色是什么？
- 我应该先看哪几份文档？
- 我下一步应该跑什么命令？

## 1. 如果你是日常开发者

目标：
- 明白当前产品边界
- 明白页面/API/采集哪些能改、哪些不能改
- 知道改完后最小验证顺序

先看：
1. `docs/product-plan.md`
2. `docs/mvp-contract.md`
3. `docs/command-matrix.md`

按方向补看：
- 前端实现：`docs/frontend-contract.md`
- 采集/API：`docs/ingest-contract.md`
- 测试与回归：`docs/test-matrix.md`

默认命令入口：
- `npm run docs:check`
- `npm run runtime:check`
- `npm run test:weapp`
- `npm run test:api`
- `npm run test:ingest`
- `npm run test:scripts`
- `npm run mvp:smoke`

## 2. 如果你是演示 / 联调操作者

目标：
- 知道 demo 怎么启动
- 知道本地 API、小程序、DevTools 怎么联调
- 知道失败后看哪份状态产物

先看：
1. `docs/command-matrix.md`
2. `docs/delivery-checklist.md`

然后直接看运行产物：
- `output/delivery-bundle/RUNBOOK.txt`
- `output/delivery-bundle/QUICKSTART.txt`

默认命令入口：
- `npm run demo:serve`
- `npm run demo:status`
- `npm run demo:open`
- `npm run mvp:smoke`
- `npm run weapp:audit`
- `npm run weapp:smoke`
- `npm run runtime:check`

关键产物位置：
- `output/demo-start/**`
- `output/mvp-smoke/**`
- `output/weapp-bundle/**`
- `output/weapp-devtools/**`

## 3. 如果你是交付操作者

目标：
- 判断当前版本能不能交付
- 生成可审阅总包
- 知道 dry-run、apply、回退分别走哪条路径

先看：
1. `docs/delivery-checklist.md`
2. `docs/command-matrix.md`

然后直接看交付总包入口层：
- `output/delivery-bundle/README.txt`
- `output/delivery-bundle/RUNBOOK.txt`
- `output/delivery-bundle/QUICKSTART.txt`

需要精确脚本和文件边界时，再看：
- `output/delivery-bundle/artifacts/manifest/OPERATOR.txt`
- `output/delivery-bundle/artifacts/manifest/README.txt`

默认命令入口：
- `npm run delivery:report`
- `npm run baseline:report`
- `npm run delivery:check`
- `npm run runtime:check`
- `npm run delivery:manifest:write`
- `npm run delivery:bundle:write`
- `npm run delivery:execute -- --all-required`
- `npm run delivery:session -- --step frontend --apply --write-audit`
- `npm run delivery:revert -- --audit output/delivery-session/latest.json`

关键产物位置：
- `output/delivery-bundle/artifacts/check.json`
- `output/delivery-bundle/artifacts/bundle.json`
- `output/delivery-bundle/artifacts/execute-audit/**`
- `output/delivery-bundle/artifacts/session-audit/**`

## 4. 如果你是采集 / 运维操作者

目标：
- 明白来源边界、发布闸门、回退和复核规则
- 知道采集健康、显式基线、云函数镜像该看哪里

先看：
1. `docs/ingest-contract.md`
2. `docs/test-matrix.md`
3. `docs/command-matrix.md`

必要时补看：
- `docs/sources.md`
- `docs/cloud-deploy.md`
- `docs/delivery-checklist.md`

默认命令入口：
- `npm run ingest:demo`
- `npm run ingest:watch`
- `npm run ingest:health`
- `npm run baseline:report`
- `npm run baseline:refresh`
- `npm run cloud:sync`

关键产物位置：
- `services/ingest/var/runtime/**`
- `services/api/var/runtime/**`
- `output/weapp-bundle/**`
- `output/weapp-devtools/**`

## 5. 如果你不知道自己该看哪一份

按这个顺序：

1. `docs/role-guide.md`
2. `docs/command-matrix.md`
3. `docs/mvp-contract.md`
4. 按你的工作方向进入 `frontend / ingest / test / delivery` 对应文档

## 6. 不同角色不要跳过的底线

- 开发者不要跳过 `docs/mvp-contract.md`
- 演示操作者不要跳过 `RUNBOOK.txt`
- 交付操作者不要跳过 `delivery:check`
- 采集/运维操作者不要跳过 `docs/ingest-contract.md`
- 任何角色都不要把 runtime 产物直接当成提交基线手动覆盖
