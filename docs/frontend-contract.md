# 前端执行基线

本文档服从 [MVP 总契约](./mvp-contract.md)，不定义新的产品模式，只把 `apps/weapp/**` 需要执行的页面、字段、交互边界写死。  
本文档的直接受众是小程序前端实现者。它不负责采集解析细节，也不负责测试优先级定义；这两部分分别服从 `ingest-contract.md` 和 `test-matrix.md`。

## 1. 文档目的

前端实现必须以本文档为唯一页面执行基线，避免：

- 页面自己发明状态名
- 页面自己发明字段名
- 同一类待核对在不同页走不同动作
- 多路并行时同时修改同一套 compare 核心逻辑

## 2. 页面地图

当前页面固定为：

1. `pages/home/index`
2. `pages/source-status/index`
3. `pages/review-center/index`
4. `pages/messages/index`
5. `pages/notices/index`
6. `pages/notice-detail/index`
7. `pages/positions/index`
8. `pages/compare/index`
9. `pages/profile/index`

当前公共组件固定为：

- `components/trust-card`

当前前端统一数据访问入口固定为：

- `apps/weapp/utils/api.js`

## 3. 页面级职责

### 3.1 首页

负责：

- 展示最新公告摘要
- 展示来源状态摘要
- 展示对比方案入口
- 根据最新公告或订阅命中给出快捷行动入口

不负责：

- 长链路筛选
- 手工复核
- 深度岗位决策

### 3.2 公告列表

负责：

- 公告筛选
- 区分可选岗公告与仅公告公告
- 从公告进入详情页

不负责：

- 多岗位决策
- 数据源治理

### 3.3 公告详情

负责：

- 展示公告正文摘要、阶段、来源信息
- 判断是否有结构化岗位
- 提供进入岗位列表或对比链路的动作

不负责：

- 批量运营动作
- 直接执行复核

### 3.4 岗位列表

负责：

- 岗位检索、筛选、排序
- 加入对比组
- 批量把当前结果带入对比组
- 展示当前公告或消息上下文

不负责：

- 来源状态治理
- 手工纠错

### 3.5 岗位对比

负责：

- 同考试类型岗位对比
- 方案保存、切换、复用
- 规则解释
- `待核对` 分流与动作跳转
- 分享摘要

不负责：

- 原始数据修复
- 直接修改结构化结果

### 3.6 消息中心

负责：

- 展示订阅命中和提醒
- 提供进入公告、岗位、对比的快捷入口

不负责：

- 手工改数
- 采集状态展示

### 3.7 来源状态

负责：

- 展示发布闸门、来源健康度、卡点
- 提供进入复核中心或当前卡点的动作

不负责：

- 岗位选择决策

### 3.8 复核中心

负责：

- 展示待复核、已解决、重开等队列
- 展示复核原因、候选版本、回退信息

不负责：

- 用户侧岗位浏览

### 3.9 我的

负责：

- 收藏
- 订阅
- 对比方案列表
- 个人画像
- 本地/远端连接配置

不负责：

- 公告主浏览
- 采集治理

## 4. 页面间流转

必须固定以下关键链路：

- 首页 -> 公告列表
- 首页 -> 来源状态
- 首页 -> 对比方案
- 公告列表 -> 公告详情 -> 岗位列表
- 岗位列表 -> 对比页
- 消息中心 -> 岗位列表 / 对比页
- 对比页 `人工纠错待核对` -> 岗位列表
- 对比页 `可信度待核对` -> 来源状态或复核中心

对比页的分流动作固定为：

- `人工纠错待核对`
  - 默认动作：回原岗位页
  - 默认路由：`/pages/positions/index?noticeId={noticeId}`
- `可信度待核对`
  - 默认动作：走 `buildTrustAction(noticeTrust)`
  - `publishGateFocus === "review"` 时优先去 `review-center`
  - 其他卡点优先去 `source-status`

## 5. 页面状态模型

所有页面状态统一使用以下 5 类：

- `loading`
- `empty`
- `content`
- `degraded`
- `error`

语义固定为：

- `loading`：数据仍在请求或初始化
- `empty`：请求成功但没有可展示内容
- `content`：有完整可展示内容
- `degraded`：数据可展示，但部分能力被降级，例如仅公告模式、结构化需关注
- `error`：请求失败或关键依赖不可用

页面不得自定义第 6 类主状态名。若需要更细粒度状态，只能作为子标记挂在以上 5 类之下。

## 6. 公共组件与复用规则

当前可复用公共组件固定为：

- `trust-card`

当前可复用公共工具固定包括：

- `api.js`
- `compare-group-actions.js`
- `notice-action-guidance.js`
- `notice-compare-guidance.js`
- `position-action-guidance.js`
- `trust-action.js`

复用规则：

- 来源可信度展示统一优先用 `trust-card` 或其语义模型
- 来源跳转动作统一走 `buildTrustAction(noticeTrust)`
- 对比组容量、复用、替换建议统一走共享 compare 规则
- 页面不要自行复制 compare 分流规则到本地常量

## 7. 前端字段消费契约

前端必须消费并保持命名不变的核心字段：

- `noticeId`
- `examType`
- `hasStructuredPositions`
- `noticeTrust`
- `hasManualCorrections`
- `correctedFields`
- `correctionSummary`
- `compareSuggestion`
- `viewPreferences`

对比页必须稳定消费的字段包括：

- `noticeTrust.parseQualityStatus`
- `noticeTrust.trustLabel`
- `noticeTrust.publishGateStatus`
- `noticeTrust.publishGateFocus`
- `hasManualCorrections`
- `correctedFields`
- `mismatchKeys`
- `mismatchReasons`
- `ruleScore`
- `barrierCount`

对比方案限制必须使用共享常量定义，不允许页面自行硬编码其他值：

- 单组最多 `4` 岗
- 最多 `20` 组方案
- 跨考试类型禁止对比

## 8. 文案与交互规则

规则层产出的文案必须原样消费或只做轻度润色，不得改语义：

- `noticeTrust.trustLabel`
- `parseQualitySummary`
- `publishGateLabel`
- `publishGateDetail`
- `correctionSummary`
- compare 规则解释

页面允许自行润色的文案范围：

- 标题
- 引导语
- 空态描述
- 按钮补充说明

但不能改变以下动作语义：

- `人工纠错待核对` 默认回岗位页
- `可信度待核对` 默认看当前卡点
- `仅公告模式` 不开放岗位对比和推荐

## 9. 禁止事项

- 禁止两路同时修改 compare 页核心分流逻辑
- 禁止页面新增采集层没有定义的字段
- 禁止页面把 `待核对` 合并成单一桶
- 禁止在仅公告模式下开放岗位对比入口
- 禁止页面自己定义第二套来源状态动作规则

## 10. 前端验收标准

- 9 个页面职责与本文件一致
- 关键流转链路全部能走通
- compare 页只允许同考试类型内对比
- compare 页单组容量固定为 4，方案数量固定为 20
- `待核对` 必须拆成 `人工纠错 / 可信度 / 其他`
- `人工纠错待核对` 默认回岗位页
- `可信度待核对` 默认走 `buildTrustAction`
- 页面主状态必须落在 `loading / empty / content / degraded / error` 五类中
