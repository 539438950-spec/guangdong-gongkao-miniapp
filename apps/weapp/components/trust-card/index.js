Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    title: {
      type: String,
      value: "数据可信度"
    },
    trust: {
      type: Object,
      value: null
    },
    action: {
      type: Object,
      value: null
    },
    badgeClass: {
      type: String,
      value: ""
    },
    showCard: {
      type: Boolean,
      value: true
    },
    showTitle: {
      type: Boolean,
      value: true
    },
    showCoverage: {
      type: Boolean,
      value: true
    },
    showWorkbook: {
      type: Boolean,
      value: true
    },
    showFetch: {
      type: Boolean,
      value: true
    },
    showPublish: {
      type: Boolean,
      value: true
    },
    showRun: {
      type: Boolean,
      value: true
    },
    showPublishDetail: {
      type: Boolean,
      value: true
    },
    showRiskSummary: {
      type: Boolean,
      value: true
    }
  },

  methods: {
    handleActionTap(event) {
      const { route } = event.currentTarget.dataset;
      if (!route) {
        return;
      }
      this.triggerEvent("actiontap", { route });
    }
  }
});
