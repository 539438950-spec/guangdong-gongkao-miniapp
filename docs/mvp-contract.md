# 广东公考小程序 MVP 契约

## 1. 文档目的

这份文档是整个项目的总契约，不是分线实现细则。

它负责三件事：

- 定义首版产品边界
- 定义全局统一字段和规则
- 定义并行开发时的跨模块边界

凡是跨前端、采集、API、测试的公共约束，以本文件为准。具体执行细节分别下沉到分线文档：

- [前端执行基线](./frontend-contract.md)
- [采集/API 执行基线](./ingest-contract.md)
- [测试与验收基线](./test-matrix.md)

## 2. MVP 边界

### 2.1 首版要做

- 官方公告聚合
- 结构化岗位列表
- 岗位检索、岗位对比、相似岗位推荐
- 收藏、订阅、浏览记录、站内消息
- 数据源状态页、复核中心、发布闸门可视化

### 2.2 首版不做

- 题库、模考、课程、直播
- 非官方经验社区
- 全国全量覆盖
- 激进的“全网一把抓”
- 黑盒 AI 选岗推荐

## 3. 页面清单

当前 MVP 页面固定为以下 9 个：

1. `pages/home/index`
2. `pages/source-status/index`
3. `pages/review-center/index`
4. `pages/messages/index`
5. `pages/notices/index`
6. `pages/notice-detail/index`
7. `pages/positions/index`
8. `pages/compare/index`
9. `pages/profile/index`

页面职责如下：

| 页面 | 核心职责 | 不承担的职责 |
| --- | --- | --- |
| 首页 | 最新公告、来源状态摘要、对比方案入口 | 长链路筛选 |
| 公告列表 | 公告筛选、只看可选岗公告 | 复杂对比决策 |
| 公告详情 | 看公告、看阶段、进岗位列表/对比 | 批量运营动作 |
| 岗位列表 | 检索、筛选、排序、加对比组 | 数据源治理 |
| 岗位对比 | 方案对比、规则解释、待核对分流 | 原始数据修复 |
| 消息中心 | 订阅命中、提醒、快捷跳转 | 手工改数 |
| 来源状态 | 发布闸门、来源健康度、卡点 | 候选人选岗决策 |
| 复核中心 | 复核队列、人工覆盖、关闭/重开 | 用户侧浏览 |
| 我的 | 收藏、订阅、比较组、个人画像、连接配置 | 公告/岗位主浏览 |

## 4. 核心数据模型

本项目首版统一使用三层结构：

1. `Notice`
2. `PositionBatch`
3. `PositionNormalized`

### 4.1 Notice

`Notice` 表示一条官方公告或一个被聚合后的公告实体。

必需字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 公告唯一 ID，格式建议 `sourceId|notice-slug` |
| `sourceId` | string | 来源 ID，例如 `rsks-gd` |
| `examType` | string | 考试类型，首版只允许 `guangdong-provincial`、`national` |
| `title` | string | 公告标题 |
| `url` | string | 原文链接 |
| `publishedAt` | string | 公告发布时间 |
| `updatedAt` | string | 最近更新时间 |
| `area` | string | 地区 |
| `status` | string | 发布状态，默认 `validated` |

建议字段：

- `summary`
- `registrationStart`
- `registrationEnd`
- `writtenExamAt`
- `attachments`
- `contentHash`
- `noticeStageId`
- `noticeStageLabel`
- `noticeBatch`
- `mergedSources`
- `mergedSourceCount`
- `hasStructuredPositions`

### 4.2 PositionBatch

`PositionBatch` 表示某条岗位表附件的一次解析版本。

必需字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 批次 ID |
| `noticeId` | string | 对应公告 ID |
| `sourceId` | string | 来源 ID |
| `attachmentUrl` | string | 岗位表附件地址 |
| `version` | number | 版本号 |
| `parseStatus` | string | `pending / parsed / failed / attachment-only` |
| `rowsTotal` | number | 结构化总行数 |

建议字段：

- `parseLog`
- `headerTemplateId`
- `sheetSummary`
- `fieldCoveragePercent`

### 4.3 PositionNormalized

`PositionNormalized` 表示前台真正消费的标准岗位实体。

必需字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 岗位唯一 ID |
| `noticeId` | string | 公告 ID |
| `batchId` | string | 岗位批次 ID |
| `examType` | string | 考试类型 |
| `area` | string | 地区 |
| `agency` | string | 单位 |
| `title` | string | 岗位名称 |
| `positionCode` | string | 职位代码 |
| `positionType` | string | 职位类型 |
| `headcount` | number | 招录人数 |
| `educationRaw` | string | 学历原文 |
| `educationLevel` | string | 标准学历等级 |
| `degreeRaw` | string | 学位原文 |
| `degreeLevel` | string | 标准学位等级 |
| `majorRaw` | string | 专业原文 |
| `majorTags` | string[] | 归一化专业标签 |
| `majorCodes` | string[] | 专业代码 |
| `serviceRequirement` | string | 基层经历要求 |
| `freshGraduateOnly` | boolean | 是否仅限应届 |
| `politicalStatus` | string | 政治面貌要求 |
| `notes` | string | 其他要求 |
| `publishedAt` | string | 公告发布时间 |
| `normalizedReady` | boolean | 是否完成结构化 |

建议字段：

- `examArea`
- `sourceNoticeTitle`
- `sourceUrl`
- `expired`
- `sourceId`
- `hasManualCorrections`
- `correctedFields`
- `correctionSummary`
- `correctionLog`

## 5. 前台扩展字段

前台页面允许在标准岗位实体上做衍生，但衍生字段不能反向污染采集层原始定义。

### 5.1 NoticeTrust

`noticeTrust` 是前台判断可信度与发布卡点的统一对象。

必需字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `sourceId` | string | 来源 ID |
| `sourceName` | string | 来源名称 |
| `parseQualityStatus` | string | `healthy / warning / attachment-only` |
| `trustLabel` | string | 前台显示标签 |
| `publishGateStatus` | string | 发布闸门状态 |
| `publishGateFocus` | string | 当前卡点，例如 `parse / review / release` |

建议字段：

- `parseQualitySummary`
- `fieldCoveragePercent`
- `workbookSheetSummary`
- `lastSuccessfulFetchedAt`
- `lastPublishedAt`
- `publishGateLabel`
- `publishGateDetail`
- `riskSummary`
- `runStatusLabel`

### 5.2 CompareGroup

对比方案统一使用：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 对比组 ID |
| `name` | string | 方案名 |
| `examType` | string | 考试类型 |
| `positionIds` | string[] | 方案内岗位 ID |
| `viewPreferences` | object | 当前视图配置 |

限制固定为：

- 最多 `20` 组方案
- 单组最多 `4` 个岗位
- 跨考试类型禁止对比

## 6. 字段命名规则

### 6.1 命名原则

- 采集标准字段用英文小驼峰
- 页面衍生字段也用英文小驼峰
- 原始值与标准值必须双轨并存
- 不允许同义字段并存，例如 `edu` / `education` / `educationRaw`

### 6.2 一组固定别名映射

人工纠错和行级高亮统一使用以下别名映射：

| 原始/纠错字段 | 对比行 key |
| --- | --- |
| `educationRaw` / `educationLevel` | `education` |
| `degreeRaw` / `degreeLevel` | `degree` |
| `majorRaw` / `majorTags` / `majorCodes` | `major` |
| `freshGraduateOnly` | `freshGraduateOnlyLabel` |
| `serviceRequirement` | `serviceRequirement` |
| `politicalStatus` | `politicalStatus` |
| `notes` | `notes` |

这组映射一旦变更，必须同时更新：

- `apps/weapp/pages/compare/index.js`
- `apps/weapp/test/pages.test.js`
- 相关运营文档

## 7. 岗位对比规则

### 7.1 硬规则

- 只允许同一 `examType` 内对比
- 单个对比组最多 `4` 个岗位
- 登录用户最多保存 `20` 组方案
- 同一岗位可跨公告对比，但不能跨考试类型

### 7.2 推荐召回规则

首版只做规则推荐，不做 AI 推荐。

召回优先级：

1. 学历
2. 学位
3. 专业标签 / 专业代码
4. 基层经历
5. 应届限制
6. 地区
7. 职位类型
8. 政治面貌
9. 其他要求

推荐结果必须给出命中原因，例如：

- `学历一致`
- `专业重合`
- `基层经历要求一致`

## 8. 待核对分流规则

`待核对` 不是一个笼统状态，首版必须拆成三类：

1. `人工纠错待核对`
2. `可信度待核对`
3. `其他待核对`

### 8.1 人工纠错待核对

进入条件：

- `hasManualCorrections === true`
- 且纠错字段命中门槛相关行，例如：
  - `education`
  - `degree`
  - `major`
  - `serviceRequirement`
  - `freshGraduateOnlyLabel`
  - `politicalStatus`
  - `notes`
  - `trustLabel`

前台动作：

- 默认按钮：`回原岗位页`
- 默认路由：`/pages/positions/index?noticeId={noticeId}`

处理原则：

- 这类岗位不能因为规则分高就直接进“优先跟进”
- 一旦人工纠错涉及门槛字段，优先级降为 `待核对`

### 8.2 可信度待核对

进入条件：

- `noticeTrust.parseQualityStatus === "attachment-only"`
- 或 `noticeTrust.publishGateFocus` 指向 `parse / review / release`
- 或来源当前仍处于“只公告模式”

前台动作：

- 默认按钮：`查看当前卡点`
- 默认路由：来自 `buildTrustAction(noticeTrust)` 的主路由

处理原则：

- 这类问题优先回来源治理页面，不回岗位页
- 如果卡点在 `review`，优先进入 `review-center`
- 如果卡点在 `parse` 或 `release`，优先进入 `source-status`

### 8.3 其他待核对

进入条件：

- 规则分中等
- 条件未完全匹配但未到直接排除
- 或需要用户自己确认的非结构化限制

前台动作：

- 默认保持在对比页内查看原因
- 如有 `noticeId`，可提供二级入口回岗位页

## 9. 发布闸门规则

前台是否开放“岗位对比/推荐”，取决于结构化发布闸门，而不是是否抓到公告。

### 9.1 可开放岗位能力

必须同时满足：

- 公告抓取成功
- 岗位表下载成功
- 表头识别成功
- 关键字段覆盖率达标
- 批次结构化校验通过

### 9.2 只开放公告，不开放岗位能力

任一条件成立即可：

- 只有公告，没有可用岗位表
- 岗位表解析失败
- 关键字段覆盖率不达标
- 来源处于 `notice-only` 覆盖模式

此时前台行为固定为：

- 公告照常展示
- 不开放岗位对比和推荐
- 明确展示“仅公告模式”或等价提示

## 10. 并行开发边界

### 10.1 可并行路线

| 路线 | 主要目录 | 产出 |
| --- | --- | --- |
| A 产品契约 | `docs/**`、常量/规则定义 | 字段契约、流程规则 |
| B 小程序前端 | `apps/weapp/**` | 页面与交互 |
| C 采集与 API | `services/ingest/**`、`services/api/**` | 结构化与发布 |
| D 测试验收 | `apps/weapp/test/**`、`services/**/test/**` | 自动化测试 |

### 10.2 禁止并行踩踏

- 不允许两路同时改 `apps/weapp/pages/compare/index.js`
- 不允许前端私自新增采集字段
- 不允许测试发明未定义业务规则
- 不允许采集直接改前台文案定义

### 10.3 变更顺序

任何跨模块变更必须按以下顺序：

1. 先改本契约
2. 再改共享常量/模型
3. 再改页面或采集实现
4. 最后补测试

## 11. 分线文档索引

分线执行时，按以下顺序阅读：

1. 本文档
2. [前端执行基线](./frontend-contract.md)
3. [采集/API 执行基线](./ingest-contract.md)
4. [测试与验收基线](./test-matrix.md)

分线文档必须服从本总契约，且不能发明与本文件冲突的新模式。
