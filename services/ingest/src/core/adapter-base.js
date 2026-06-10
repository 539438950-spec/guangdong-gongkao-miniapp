class SourceAdapter {
  constructor(source) {
    this.source = source;
  }

  async fetch() {
    throw new Error("fetch() must be implemented");
  }

  async parse(_payload) {
    throw new Error("parse() must be implemented");
  }
}

module.exports = {
  SourceAdapter
};
