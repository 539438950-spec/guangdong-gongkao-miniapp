function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatText(value, fallback = "暂无") {
  const text = String(value || "").trim();
  return text || fallback;
}

function toScriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function mapExamTypeLabel(examType) {
  if (examType === "guangdong-provincial") {
    return "广东省考";
  }
  if (examType === "national") {
    return "国考";
  }
  return formatText(examType, "未知考试");
}

function mapSourceModeLabel(sourceMode) {
  if (sourceMode === "official") {
    return "官方";
  }
  if (sourceMode === "demo") {
    return "演示";
  }
  return formatText(sourceMode, "未知模式");
}

function getPublishMode(sourceState = {}) {
  if (sourceState.releaseMode) {
    return sourceState.releaseMode;
  }
  if (Number(sourceState.pendingReviewCount || 0) > 0) {
    return "notice-only";
  }
  return "positions-open";
}

function mapPublishModeLabel(sourceState = {}) {
  const publishMode = getPublishMode(sourceState);
  if (publishMode === "positions-open") {
    return "岗位能力开放";
  }
  if (publishMode === "notice-only") {
    return "仅公告模式";
  }
  return formatText(publishMode, "待确认");
}

function buildNoticePositionCount(notice, positions = []) {
  return positions.filter((item) => item.noticeId === notice.id).length;
}

function buildSourceLookup(sourceStates = []) {
  return sourceStates.reduce((lookup, item) => {
    lookup[item.sourceId] = item;
    return lookup;
  }, {});
}

function buildNoticeLookup(notices = []) {
  return notices.reduce((lookup, item) => {
    lookup[item.id] = item;
    return lookup;
  }, {});
}

function buildPositionLookup(positions = []) {
  return positions.reduce((lookup, item) => {
    lookup[item.id] = item;
    return lookup;
  }, {});
}

function renderMetricCards(metrics = []) {
  return metrics.map((item) => `
    <article class="metric-card">
      <div class="metric-label">${escapeHtml(item.label)}</div>
      <div class="metric-value">${escapeHtml(item.value)}</div>
      <div class="metric-note">${escapeHtml(item.note)}</div>
    </article>
  `).join("");
}

function renderNoticeCards(notices = []) {
  return notices.map((notice, index) => {
    const availabilityClass = notice.hasStructuredPositions ? "tag-ok" : "tag-warn";
    const availabilityText = notice.hasStructuredPositions ? "可选岗" : "仅公告";
    const sourceModeClass = notice.sourceMode === "demo" ? "tag-warn" : "tag-neutral";
    return `
      <article class="panel-card notice-card" style="animation-delay:${index * 40}ms">
        <div class="card-topline">
          <span class="tag tag-neutral">${escapeHtml(notice.examTypeLabel)}</span>
          <span class="tag ${availabilityClass}">${availabilityText}</span>
          <span class="tag ${sourceModeClass}">${escapeHtml(notice.sourceModeLabel)}</span>
        </div>
        <h3>${escapeHtml(notice.title)}</h3>
        <p class="summary">${escapeHtml(formatText(notice.summary, "暂无摘要"))}</p>
        <dl class="kv-list">
          <div><dt>地区</dt><dd>${escapeHtml(formatText(notice.area, "未标注"))}</dd></div>
          <div><dt>发布时间</dt><dd>${escapeHtml(formatText(notice.publishedAt, "待更新"))}</dd></div>
          <div><dt>报名时间</dt><dd>${escapeHtml(formatText(notice.registrationWindow, "待更新"))}</dd></div>
          <div><dt>岗位数</dt><dd>${escapeHtml(String(notice.positionCount || 0))}</dd></div>
        </dl>
      </article>
    `;
  }).join("");
}

function renderSourceCards(sourceStates = []) {
  return sourceStates.map((source, index) => {
    const publishMode = mapPublishModeLabel(source);
    const healthClass = Number(source.pendingReviewCount || 0) > 0 ? "tag-warn" : "tag-ok";
    const healthText = Number(source.pendingReviewCount || 0) > 0 ? "待复核" : "稳定";
    return `
      <article class="panel-card source-card" style="animation-delay:${index * 40}ms">
        <div class="card-topline">
          <span class="tag tag-neutral">${escapeHtml(formatText(source.sourceModeLabel, mapSourceModeLabel(source.sourceMode)))}</span>
          <span class="tag ${healthClass}">${escapeHtml(healthText)}</span>
        </div>
        <h3>${escapeHtml(source.sourceName)}</h3>
        <p class="summary">${escapeHtml(formatText(source.sourceModeNote || source.lastErrorSummary, "当前来源未发现额外风险说明。"))}</p>
        <dl class="kv-list">
          <div><dt>最近抓取</dt><dd>${escapeHtml(formatText(source.lastFetchedAt, "暂无"))}</dd></div>
          <div><dt>最近发布</dt><dd>${escapeHtml(formatText(source.lastPublishedAt, "暂无"))}</dd></div>
          <div><dt>当前模式</dt><dd>${escapeHtml(publishMode)}</dd></div>
          <div><dt>连续失败</dt><dd>${escapeHtml(String(source.consecutiveFailureCount || 0))}</dd></div>
          <div><dt>待复核</dt><dd>${escapeHtml(String(source.pendingReviewCount || 0))}</dd></div>
          <div><dt>结构摘要</dt><dd>${escapeHtml(formatText(source.structureSummary, "暂无"))}</dd></div>
        </dl>
      </article>
    `;
  }).join("");
}

function renderPositionCards(positions = [], selectedIds = []) {
  const selectedSet = new Set(selectedIds);
  return positions.map((position, index) => {
    const selectedClass = selectedSet.has(position.id) ? "is-selected" : "";
    const freshTag = position.freshGraduateOnly ? `<span class="tag tag-accent">应届</span>` : "";
    return `
      <article class="panel-card position-card ${selectedClass}" data-position-id="${escapeHtml(position.id)}" data-exam-type="${escapeHtml(position.examType)}" style="animation-delay:${index * 40}ms">
        <div class="card-topline">
          <span class="tag tag-neutral">${escapeHtml(formatText(position.area, "未知地区"))}</span>
          <span class="tag tag-neutral">${escapeHtml(formatText(position.positionType, "岗位"))}</span>
          ${freshTag}
        </div>
        <h3>${escapeHtml(position.title)}</h3>
        <p class="summary">${escapeHtml(formatText(position.agency, "未知单位"))}</p>
        <dl class="kv-list">
          <div><dt>岗位代码</dt><dd>${escapeHtml(formatText(position.positionCode, "暂无"))}</dd></div>
          <div><dt>招录人数</dt><dd>${escapeHtml(String(position.headcount || 0))}</dd></div>
          <div><dt>学历/学位</dt><dd>${escapeHtml(`${formatText(position.education, "不限")} / ${formatText(position.degree, "不限")}`)}</dd></div>
          <div><dt>专业</dt><dd>${escapeHtml(formatText(position.major, "未标注"))}</dd></div>
          <div><dt>基层经历</dt><dd>${escapeHtml(formatText(position.serviceRequirement, "未标注"))}</dd></div>
          <div><dt>政治面貌</dt><dd>${escapeHtml(formatText(position.politicalStatus, "未标注"))}</dd></div>
        </dl>
        <button class="compare-button" type="button" data-compare-toggle="${escapeHtml(position.id)}">加入对比</button>
      </article>
    `;
  }).join("");
}

function renderOpsItems(reviewQueue = [], sourceStates = [], messages = []) {
  const items = [];

  reviewQueue.forEach((item) => {
    items.push({
      kind: "待复核",
      title: item.sourceName || item.sourceId || "未知来源",
      detail: Array.isArray(item.reasons) && item.reasons.length
        ? item.reasons.join("；")
        : "已进入人工复核队列。"
    });
  });

  sourceStates
    .filter((item) => item.sourceModeNote || Number(item.pendingReviewCount || 0) > 0)
    .forEach((item) => {
      items.push({
        kind: "来源提示",
        title: item.sourceName,
        detail: item.sourceModeNote || `当前待复核 ${item.pendingReviewCount || 0} 条。`
      });
    });

  messages.forEach((item) => {
    items.push({
      kind: item.typeLabel || item.type || "消息",
      title: item.title || item.summary || "站内提醒",
      detail: item.summary || item.preview || "暂无详情"
    });
  });

  if (!items.length) {
    items.push({
      kind: "系统状态",
      title: "当前无阻塞项",
      detail: "默认示例快照已准备好，可直接演示公告检索、来源状态和岗位对比。"
    });
  }

  return items.slice(0, 6).map((item) => `
    <li class="ops-item">
      <span class="ops-kind">${escapeHtml(item.kind)}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.detail)}</p>
    </li>
  `).join("");
}

function renderCompareShell(compareGroup = {}, selectedPositions = []) {
  const name = formatText(compareGroup.name, "当前演示对比");
  const examTypeLabel = compareGroup.examTypeLabel || mapExamTypeLabel(compareGroup.examType);
  const summary = selectedPositions.length
    ? `已带入 ${selectedPositions.length} 个岗位，支持同考试类型内最多 4 岗对比。`
    : "当前没有岗位进入对比篮。";
  return `
    <section class="compare-studio">
      <div class="compare-header">
        <div>
          <span class="eyebrow">岗位对比</span>
          <h2>${escapeHtml(name)}</h2>
          <p id="compare-summary">${escapeHtml(summary)}</p>
        </div>
        <div class="compare-rules">
          <span class="tag tag-neutral">${escapeHtml(examTypeLabel)}</span>
          <span class="tag tag-neutral">最多 4 岗</span>
          <span class="tag tag-neutral">跨考试类型禁止</span>
        </div>
      </div>
      <div id="compare-selection" class="compare-selection"></div>
      <div id="compare-alert" class="compare-alert" hidden></div>
      <div class="compare-table-wrap">
        <table class="compare-table" id="compare-table"></table>
      </div>
    </section>
  `;
}

function buildCompareClientPayload(notices = [], positions = [], compareGroups = [], activeCompareGroup = null) {
  return {
    notices,
    positions,
    compareGroups,
    activeCompareGroup
  };
}

function buildDemoPage({ dashboard, notices, positionsPayload, baseUrl = "" }) {
  const sourceStates = dashboard.sourceStates || [];
  const compareGroups = dashboard.compareGroups || [];
  const reviewQueue = dashboard.reviewQueue || [];
  const messages = dashboard.messages || [];
  const activeCompareGroup = dashboard.activeCompareGroup || compareGroups[0] || {
    id: "browser-demo-group",
    name: "浏览器演示对比组",
    examType: positionsPayload.primaryExamType || "guangdong-provincial",
    examTypeLabel: mapExamTypeLabel(positionsPayload.primaryExamType || "guangdong-provincial"),
    positionIds: positionsPayload.initialSelectedIds || []
  };
  const positions = Array.isArray(positionsPayload.positions) ? positionsPayload.positions : [];
  const displayedPositions = positions.slice(0, 8);
  const selectedIds = Array.isArray(activeCompareGroup.positionIds) ? activeCompareGroup.positionIds : [];
  const metrics = [
    {
      label: "公告总数",
      value: String(dashboard.stats.noticeCount || notices.length || 0),
      note: "聚合后可直接消费"
    },
    {
      label: "岗位总数",
      value: String(dashboard.stats.positionCount || positions.length || 0),
      note: "仅统计已结构化岗位"
    },
    {
      label: "来源数",
      value: String(dashboard.stats.sourceCount || sourceStates.length || 0),
      note: `${dashboard.stats.publishableCount || 0} 个来源已开放岗位能力`
    },
    {
      label: "待复核",
      value: String(dashboard.stats.pendingReviewTotal || 0),
      note: "解析异常进入人工复核队列"
    },
    {
      label: "对比方案",
      value: String(dashboard.stats.compareGroupCount || compareGroups.length || 0),
      note: "最多 20 组，每组最多 4 岗"
    },
    {
      label: "未读消息",
      value: String(dashboard.stats.unreadMessageCount || 0),
      note: "收藏、订阅、异常提醒"
    }
  ];
  const selectedPositionMap = buildPositionLookup(
    positions.filter((item) => selectedIds.includes(item.id))
  );
  const comparePayloadPositions = [
    ...displayedPositions,
    ...selectedIds
      .map((id) => selectedPositionMap[id])
      .filter(Boolean)
      .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index)
  ];
  const compareClientPayload = buildCompareClientPayload(
    notices,
    comparePayloadPositions,
    compareGroups,
    activeCompareGroup
  );

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='18' fill='%23163f35'/%3E%3Cpath d='M18 22h28v6H18zm0 12h28v6H18zm0 12h18v6H18z' fill='%23f7f4ee'/%3E%3C/svg%3E" />
  <title>广东公考信息与选岗 Demo</title>
  <style>
    :root {
      --bg: #f4efe6;
      --paper: rgba(255, 251, 245, 0.92);
      --panel: #fffdfa;
      --ink: #10251f;
      --muted: #5e6f68;
      --line: rgba(16, 37, 31, 0.1);
      --green: #1f7a63;
      --green-soft: rgba(31, 122, 99, 0.12);
      --orange: #b55c2d;
      --orange-soft: rgba(181, 92, 45, 0.12);
      --blue: #225c7a;
      --shadow: 0 18px 50px rgba(16, 37, 31, 0.08);
      --radius: 24px;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(34, 92, 122, 0.14), transparent 30%),
        radial-gradient(circle at top right, rgba(181, 92, 45, 0.12), transparent 28%),
        linear-gradient(180deg, #fbf7f1 0%, var(--bg) 100%);
      font-family: "LXGW WenKai Screen", "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    a { color: inherit; text-decoration: none; }
    .shell {
      width: min(1280px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 22px 0 56px;
    }
    .hero {
      position: relative;
      overflow: hidden;
      border-radius: 30px;
      padding: 28px;
      background:
        linear-gradient(135deg, rgba(255,255,255,0.18), transparent 40%),
        linear-gradient(135deg, #12352d 0%, #1d4f44 58%, #245b5a 100%);
      color: #f7f4ee;
      box-shadow: 0 24px 60px rgba(18, 53, 45, 0.24);
    }
    .hero::after {
      content: "";
      position: absolute;
      right: -40px;
      top: -40px;
      width: 220px;
      height: 220px;
      border-radius: 50%;
      background: rgba(255,255,255,0.08);
      filter: blur(4px);
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 13px;
      letter-spacing: 0.04em;
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.12);
    }
    .hero-grid {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 24px;
      align-items: end;
    }
    .hero h1 {
      margin: 16px 0 12px;
      font-size: clamp(34px, 5vw, 54px);
      line-height: 1.02;
      letter-spacing: -0.03em;
    }
    .hero p {
      margin: 0;
      max-width: 760px;
      color: rgba(247, 244, 238, 0.84);
      line-height: 1.8;
      font-size: 15px;
    }
    .hero-notes {
      display: grid;
      gap: 12px;
    }
    .hero-note {
      padding: 16px 18px;
      border-radius: 18px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.12);
      line-height: 1.7;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 14px;
      margin-top: 18px;
    }
    .metric-card {
      padding: 18px 16px;
      border-radius: 20px;
      background: var(--paper);
      border: 1px solid rgba(255,255,255,0.18);
      box-shadow: var(--shadow);
      backdrop-filter: blur(10px);
    }
    .metric-label {
      color: var(--muted);
      font-size: 13px;
    }
    .metric-value {
      margin-top: 10px;
      font-size: 30px;
      line-height: 1;
      font-weight: 700;
    }
    .metric-note {
      margin-top: 8px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }
    .section {
      margin-top: 24px;
    }
    .section-head {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: end;
      margin-bottom: 14px;
    }
    .section-head h2 {
      margin: 0;
      font-size: 24px;
      letter-spacing: -0.02em;
    }
    .section-head p {
      margin: 0;
      max-width: 640px;
      color: var(--muted);
      line-height: 1.7;
      font-size: 14px;
    }
    .content-grid {
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      gap: 18px;
    }
    .stack {
      display: grid;
      gap: 18px;
    }
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    .panel-card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 18px;
      box-shadow: var(--shadow);
      animation: rise 420ms ease both;
    }
    @keyframes rise {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .panel-card h3 {
      margin: 12px 0 8px;
      font-size: 19px;
      line-height: 1.35;
    }
    .summary {
      margin: 0;
      color: var(--muted);
      line-height: 1.7;
      min-height: 48px;
      font-size: 14px;
    }
    .card-topline {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      padding: 5px 10px;
      border-radius: 999px;
      font-size: 12px;
      border: 1px solid transparent;
    }
    .tag-neutral {
      background: rgba(16, 37, 31, 0.05);
      border-color: rgba(16, 37, 31, 0.08);
    }
    .tag-ok {
      color: var(--green);
      background: var(--green-soft);
      border-color: rgba(31, 122, 99, 0.18);
    }
    .tag-warn {
      color: var(--orange);
      background: var(--orange-soft);
      border-color: rgba(181, 92, 45, 0.18);
    }
    .tag-accent {
      color: var(--blue);
      background: rgba(34, 92, 122, 0.12);
      border-color: rgba(34, 92, 122, 0.18);
    }
    .kv-list {
      display: grid;
      gap: 10px;
      margin: 16px 0 0;
    }
    .kv-list div {
      display: grid;
      grid-template-columns: 78px 1fr;
      gap: 10px;
      align-items: start;
    }
    .kv-list dt {
      color: var(--muted);
      font-size: 12px;
    }
    .kv-list dd {
      margin: 0;
      font-size: 13px;
      line-height: 1.6;
    }
    .ops-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 12px;
    }
    .ops-item {
      padding: 14px 16px;
      border-radius: 18px;
      background: rgba(16, 37, 31, 0.03);
      border: 1px solid rgba(16, 37, 31, 0.06);
    }
    .ops-item strong {
      display: block;
      margin-top: 6px;
      font-size: 15px;
    }
    .ops-item p {
      margin: 8px 0 0;
      color: var(--muted);
      line-height: 1.7;
      font-size: 13px;
    }
    .ops-kind {
      display: inline-flex;
      padding: 4px 8px;
      border-radius: 999px;
      background: var(--orange-soft);
      color: var(--orange);
      font-size: 12px;
    }
    .positions-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
    }
    .position-card {
      position: relative;
      transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
    }
    .position-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 20px 42px rgba(16, 37, 31, 0.1);
    }
    .position-card.is-selected {
      border-color: rgba(31, 122, 99, 0.26);
      box-shadow: 0 22px 42px rgba(31, 122, 99, 0.12);
    }
    .compare-button {
      width: 100%;
      margin-top: 16px;
      padding: 11px 14px;
      border: 0;
      border-radius: 14px;
      background: #163f35;
      color: #f7f4ee;
      font: inherit;
      cursor: pointer;
      transition: transform 160ms ease, opacity 160ms ease, background 160ms ease;
    }
    .compare-button:hover {
      transform: translateY(-1px);
      background: #1b5144;
    }
    .compare-button.is-secondary {
      background: rgba(16, 37, 31, 0.08);
      color: var(--ink);
    }
    .compare-button:disabled {
      opacity: 0.52;
      cursor: not-allowed;
      transform: none;
    }
    .compare-studio {
      margin-top: 24px;
      padding: 22px;
      border-radius: 30px;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.72), rgba(255,255,255,0.92)),
        linear-gradient(135deg, rgba(34, 92, 122, 0.08), rgba(31, 122, 99, 0.08));
      border: 1px solid rgba(16, 37, 31, 0.08);
      box-shadow: var(--shadow);
    }
    .compare-header {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      align-items: end;
    }
    .compare-header h2 {
      margin: 10px 0 8px;
      font-size: 28px;
    }
    .compare-header p {
      margin: 0;
      color: var(--muted);
      line-height: 1.7;
    }
    .compare-rules {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }
    .compare-selection {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 18px;
    }
    .selection-pill {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 16px;
      background: rgba(16, 37, 31, 0.05);
      border: 1px solid rgba(16, 37, 31, 0.08);
    }
    .selection-pill button {
      border: 0;
      background: transparent;
      color: var(--orange);
      cursor: pointer;
      font: inherit;
      padding: 0;
    }
    .compare-alert {
      margin-top: 14px;
      padding: 12px 14px;
      border-radius: 14px;
      color: var(--orange);
      background: var(--orange-soft);
      border: 1px solid rgba(181, 92, 45, 0.18);
      font-size: 13px;
    }
    .compare-table-wrap {
      margin-top: 18px;
      overflow-x: auto;
    }
    .compare-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      min-width: 720px;
    }
    .compare-table th,
    .compare-table td {
      padding: 14px 12px;
      text-align: left;
      vertical-align: top;
      border-bottom: 1px solid rgba(16, 37, 31, 0.08);
      font-size: 14px;
      line-height: 1.6;
      background: rgba(255,255,255,0.72);
    }
    .compare-table th {
      position: sticky;
      top: 0;
      z-index: 1;
      background: rgba(245, 239, 230, 0.98);
    }
    .compare-table th:first-child,
    .compare-table td:first-child {
      min-width: 120px;
      color: var(--muted);
    }
    .footer-note {
      margin-top: 20px;
      padding: 16px 18px;
      border-radius: 18px;
      background: rgba(34, 92, 122, 0.08);
      border: 1px solid rgba(34, 92, 122, 0.14);
      color: #234b63;
      line-height: 1.8;
      font-size: 14px;
    }
    code {
      padding: 2px 6px;
      border-radius: 8px;
      background: rgba(16, 37, 31, 0.06);
      font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
      font-size: 12px;
    }
    @media (max-width: 1100px) {
      .hero-grid,
      .content-grid,
      .positions-grid,
      .metrics,
      .cards-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .hero-grid {
        grid-template-columns: 1fr;
      }
      .content-grid {
        grid-template-columns: 1fr;
      }
      .positions-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .compare-header {
        flex-direction: column;
        align-items: start;
      }
    }
    @media (max-width: 760px) {
      .shell {
        width: min(100vw - 20px, 1280px);
        padding-top: 10px;
      }
      .hero {
        padding: 22px;
        border-radius: 24px;
      }
      .metrics,
      .cards-grid,
      .positions-grid {
        grid-template-columns: 1fr;
      }
      .kv-list div {
        grid-template-columns: 74px 1fr;
      }
      .compare-studio {
        padding: 18px;
      }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <div class="hero-grid">
        <div>
          <span class="eyebrow">广东公考信息 / 选岗工具 Demo</span>
          <h1>先看数据状态，再决定是否报这个岗。</h1>
          <p>这个浏览器 Demo 直接读取当前本地快照，集中演示三件事：官方公告聚合、来源发布状态、岗位对比。它不是静态宣传页，也不是题库入口，而是首版产品主线的可视化工作台。</p>
        </div>
        <div class="hero-notes">
          <div class="hero-note">当前接口：<code>${escapeHtml(baseUrl || "http://127.0.0.1:3100")}</code></div>
          <div class="hero-note">浏览器内可直接把岗位加入演示对比篮，规则与小程序一致：同考试类型、最多 4 岗。</div>
          <div class="hero-note">默认快照优先展示广东省考，国考来源在本地环境中保留演示模式，避免把不稳定采集伪装成真实可用能力。</div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="metrics">${renderMetricCards(metrics)}</div>
    </section>

    <section class="section">
      <div class="content-grid">
        <div class="stack">
          <div>
            <div class="section-head">
              <div>
                <h2>最新公告</h2>
                <p>只展示当前已入快照的公告。岗位表结构化成功的公告会标记为“可选岗”，否则仅作为公告入口存在。</p>
              </div>
            </div>
            <div class="cards-grid">${renderNoticeCards(notices.slice(0, 4))}</div>
          </div>
          <div>
            <div class="section-head">
              <div>
                <h2>岗位池</h2>
                <p>下方卡片可以直接加入演示对比篮。这个交互在浏览器里本地完成，用来验证首版“岗位对比”是否成立。</p>
              </div>
            </div>
            <div class="positions-grid">${renderPositionCards(displayedPositions, selectedIds)}</div>
          </div>
        </div>
        <div class="stack">
          <div>
            <div class="section-head">
              <div>
                <h2>来源状态</h2>
                <p>这里重点看发布时间、待复核数量和当前发布模式，直接对应采集链路是否允许前台开放岗位能力。</p>
              </div>
            </div>
            <div class="stack">${renderSourceCards(sourceStates.slice(0, 4))}</div>
          </div>
          <div class="panel-card">
            <div class="section-head">
              <div>
                <h2>运行提示</h2>
                <p>把复核队列、来源提醒和站内消息压到同一侧，方便做产品讲解和排障。</p>
              </div>
            </div>
            <ul class="ops-list">${renderOpsItems(reviewQueue, sourceStates, messages)}</ul>
          </div>
        </div>
      </div>
    </section>

    ${renderCompareShell(activeCompareGroup, positions.filter((item) => selectedIds.includes(item.id)))}

    <div class="footer-note">
      这个页面的目标是快速验证产品主线，不替代微信开发者工具中的完整小程序。当前浏览器入口：<code>${escapeHtml(`${baseUrl || "http://127.0.0.1:3100"}/demo`)}</code>，接口健康检查：<code>${escapeHtml(`${baseUrl || "http://127.0.0.1:3100"}/health`)}</code>。
    </div>
  </main>

  <script>
    window.__GONGKAO_DEMO__ = ${toScriptJson(compareClientPayload)};
    (function () {
      const state = window.__GONGKAO_DEMO__ || {};
      const allPositions = Array.isArray(state.positions) ? state.positions : [];
      const compareGroup = state.activeCompareGroup || {};
      const initialIds = Array.isArray(compareGroup.positionIds) ? compareGroup.positionIds.slice(0, 4) : [];
      const selectedIds = initialIds.filter((id) => allPositions.some((item) => item.id === id));
      const table = document.getElementById("compare-table");
      const selection = document.getElementById("compare-selection");
      const alertBox = document.getElementById("compare-alert");
      const summaryNode = document.getElementById("compare-summary");

      function getSelectedPositions() {
        return selectedIds
          .map((id) => allPositions.find((item) => item.id === id))
          .filter(Boolean);
      }

      function currentExamType() {
        const first = getSelectedPositions()[0];
        return first ? first.examType : "";
      }

      function setAlert(message) {
        if (!message) {
          alertBox.hidden = true;
          alertBox.textContent = "";
          return;
        }
        alertBox.hidden = false;
        alertBox.textContent = message;
      }

      function buildSummaryText() {
        if (!selectedIds.length) {
          return "先加入岗位，再开始同考试类型内的正式对比。";
        }
        return "已带入 " + selectedIds.length + " 个岗位，支持同考试类型内最多 4 岗对比。";
      }

      function buildTableHtml(rows, positions) {
        if (!positions.length) {
          return "<tr><th>对比项</th><th>内容</th></tr><tr><td>状态</td><td>当前还没有岗位进入对比篮。</td></tr>";
        }
        const head = [
          "<tr><th>对比项</th>",
          positions.map((item) => "<th>" + escapeHtml(item.title) + "<br><span style='color:#5e6f68;font-weight:400'>" + escapeHtml(item.agency || "") + "</span></th>").join(""),
          "</tr>"
        ].join("");
        const body = rows.map((row) => {
          return "<tr><td>" + escapeHtml(row.label) + "</td>" +
            positions.map((item) => "<td>" + escapeHtml(row.getter(item)) + "</td>").join("") +
            "</tr>";
        }).join("");
        return head + body;
      }

      function syncButtons() {
        const examType = currentExamType();
        document.querySelectorAll("[data-compare-toggle]").forEach((button) => {
          const card = button.closest(".position-card");
          const positionId = button.getAttribute("data-compare-toggle");
          const position = allPositions.find((item) => item.id === positionId);
          const selected = selectedIds.includes(positionId);
          const typeMismatch = examType && position && position.examType !== examType;
          const full = !selected && selectedIds.length >= 4;
          card.classList.toggle("is-selected", selected);
          button.textContent = selected ? "移出对比" : "加入对比";
          button.classList.toggle("is-secondary", selected);
          button.disabled = typeMismatch || full;
          if (typeMismatch) {
            button.title = "同一对比组内只能放同考试类型岗位";
          } else if (full) {
            button.title = "单组最多 4 个岗位";
          } else {
            button.title = "";
          }
        });
      }

      function renderSelection() {
        const positions = getSelectedPositions();
        if (!positions.length) {
          selection.innerHTML = "<div class='selection-pill'>当前没有岗位进入对比篮</div>";
          return;
        }
        selection.innerHTML = positions.map((item) => {
          return "<div class='selection-pill'><span>" +
            escapeHtml(item.title) + " / " + escapeHtml(item.area || "未知地区") +
            "</span><button type='button' data-remove-id='" + escapeHtml(item.id) + "'>移除</button></div>";
        }).join("");
      }

      function renderTable() {
        const rows = [
          { label: "岗位代码", getter: (item) => item.positionCode || "暂无" },
          { label: "地区", getter: (item) => item.area || "暂无" },
          { label: "招录单位", getter: (item) => item.agency || "暂无" },
          { label: "职位类别", getter: (item) => item.positionType || "暂无" },
          { label: "招录人数", getter: (item) => String(item.headcount || 0) },
          { label: "学历", getter: (item) => item.education || "不限" },
          { label: "学位", getter: (item) => item.degree || "不限" },
          { label: "专业", getter: (item) => item.major || "未标注" },
          { label: "基层经历", getter: (item) => item.serviceRequirement || "未标注" },
          { label: "政治面貌", getter: (item) => item.politicalStatus || "未标注" },
          { label: "备注", getter: (item) => item.notes || "暂无" }
        ];
        table.innerHTML = buildTableHtml(rows, getSelectedPositions());
      }

      function render() {
        if (summaryNode) {
          summaryNode.textContent = buildSummaryText();
        }
        renderSelection();
        renderTable();
        syncButtons();
      }

      document.addEventListener("click", (event) => {
        const addId = event.target && event.target.getAttribute && event.target.getAttribute("data-compare-toggle");
        const removeId = event.target && event.target.getAttribute && event.target.getAttribute("data-remove-id");

        if (removeId) {
          const index = selectedIds.indexOf(removeId);
          if (index >= 0) {
            selectedIds.splice(index, 1);
            setAlert("");
            render();
          }
          return;
        }

        if (!addId) {
          return;
        }

        const index = selectedIds.indexOf(addId);
        if (index >= 0) {
          selectedIds.splice(index, 1);
          setAlert("");
          render();
          return;
        }

        const candidate = allPositions.find((item) => item.id === addId);
        const examType = currentExamType();
        if (examType && candidate && candidate.examType !== examType) {
          setAlert("跨考试类型禁止对比。请先清空当前对比篮，或选择同一考试类型岗位。");
          return;
        }
        if (selectedIds.length >= 4) {
          setAlert("单个对比组最多 4 个岗位。");
          return;
        }
        selectedIds.push(addId);
        setAlert("");
        render();
      });

      function escapeHtml(value) {
        return String(value || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      render();
    }());
  </script>
</body>
</html>`;
}

function buildDashboardLike(seed = {}, userState = {}) {
  const notices = Array.isArray(seed.notices) ? seed.notices : [];
  const positions = Array.isArray(seed.positions) ? seed.positions : [];
  const sourceStates = Array.isArray(seed.sourceStates) ? seed.sourceStates : [];
  const reviewQueue = Array.isArray(seed.reviewQueue) ? seed.reviewQueue : [];
  const compareGroups = Array.isArray(userState.compareGroups) && userState.compareGroups.length
    ? userState.compareGroups
    : (Array.isArray(seed.compareGroups) ? seed.compareGroups : []);
  const messages = Array.isArray(userState.messages) && userState.messages.length
    ? userState.messages
    : (Array.isArray(seed.messages) ? seed.messages : []);
  const publishableCount = sourceStates.filter((item) => getPublishMode(item) === "positions-open").length;

  return {
    stats: {
      noticeCount: notices.length,
      positionCount: positions.length,
      sourceCount: sourceStates.length,
      publishableCount,
      pendingReviewTotal: reviewQueue.length,
      compareGroupCount: compareGroups.length,
      unreadMessageCount: messages.length
    },
    compareGroups,
    messages,
    sourceStates,
    reviewQueue,
    activeCompareGroup: compareGroups[0] || null
  };
}

function buildDemoPageData(seed = {}, userState = {}) {
  const rawNotices = Array.isArray(seed.notices) ? seed.notices : [];
  const rawPositions = Array.isArray(seed.positions) ? seed.positions : [];
  const sourceStates = Array.isArray(seed.sourceStates) ? seed.sourceStates : [];
  const sourceLookup = buildSourceLookup(sourceStates);

  const notices = rawNotices.map((item) => {
    const sourceState = sourceLookup[item.sourceId] || {};
    const positionCount = buildNoticePositionCount(item, rawPositions);
    return {
      ...item,
      examTypeLabel: item.examTypeLabel || mapExamTypeLabel(item.examType),
      sourceModeLabel: item.sourceModeLabel || mapSourceModeLabel(item.sourceMode || sourceState.sourceMode),
      positionCount,
      hasStructuredPositions: positionCount > 0
    };
  });

  const noticeLookup = buildNoticeLookup(notices);
  const positions = rawPositions.map((item) => ({
    ...item,
    sourceNoticeTitle: item.sourceNoticeTitle || formatText((noticeLookup[item.noticeId] || {}).title, "未知公告")
  }));

  const dashboard = buildDashboardLike(
    {
      ...seed,
      notices,
      positions,
      sourceStates
    },
    userState
  );

  const activeCompareGroup = dashboard.activeCompareGroup || {
    id: "browser-demo-group",
    name: "浏览器演示对比组",
    examType: positions[0] ? positions[0].examType : "guangdong-provincial",
    examTypeLabel: positions[0] ? mapExamTypeLabel(positions[0].examType) : "广东省考",
    positionIds: positions.slice(0, 2).map((item) => item.id)
  };
  dashboard.activeCompareGroup = {
    ...activeCompareGroup,
    examTypeLabel: activeCompareGroup.examTypeLabel || mapExamTypeLabel(activeCompareGroup.examType)
  };

  const primaryExamType = dashboard.activeCompareGroup.examType || (positions[0] ? positions[0].examType : "guangdong-provincial");
  const compareSeedIds = Array.isArray(dashboard.activeCompareGroup.positionIds) && dashboard.activeCompareGroup.positionIds.length
    ? dashboard.activeCompareGroup.positionIds
    : positions.filter((item) => item.examType === primaryExamType).slice(0, 2).map((item) => item.id);
  const primaryPositions = positions.filter((item) => item.examType === primaryExamType);

  return {
    dashboard,
    notices,
    positionsPayload: {
      positions: primaryPositions,
      primaryExamType,
      initialSelectedIds: compareSeedIds
    }
  };
}

module.exports = {
  buildDemoPage,
  buildDemoPageData
};
