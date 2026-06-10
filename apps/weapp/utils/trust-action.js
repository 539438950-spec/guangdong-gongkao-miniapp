function buildTrustAction(noticeTrust = null) {
  if (!noticeTrust || !noticeTrust.sourceId) {
    return {
      active: false,
      primaryLabel: "",
      primaryRoute: "",
      secondaryLabel: "",
      secondaryRoute: ""
    };
  }

  const sourceId = encodeURIComponent(noticeTrust.sourceId);
  const focus = noticeTrust.publishGateFocus ? encodeURIComponent(noticeTrust.publishGateFocus) : "";
  const sourceStatusRoute = `/pages/source-status/index?sourceId=${sourceId}${focus ? `&focus=${focus}` : ""}`;
  const reviewRoute = `/pages/review-center/index?sourceId=${sourceId}`;

  if (noticeTrust.publishGateFocus === "review") {
    return {
      active: true,
      primaryLabel: "去复核中心",
      primaryRoute: reviewRoute,
      secondaryLabel: "查看来源状态",
      secondaryRoute: sourceStatusRoute
    };
  }

  return {
    active: true,
    primaryLabel: focus ? "查看当前卡点" : "查看来源状态",
    primaryRoute: sourceStatusRoute,
    secondaryLabel: noticeTrust.publishGateStatus && noticeTrust.publishGateStatus !== "healthy"
      ? "去来源状态页"
      : "",
    secondaryRoute: noticeTrust.publishGateStatus && noticeTrust.publishGateStatus !== "healthy"
      ? `/pages/source-status/index?sourceId=${sourceId}`
      : ""
  };
}

module.exports = {
  buildTrustAction
};
