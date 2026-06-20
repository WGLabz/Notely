class HarnessError extends Error {
  constructor(message) {
    super(message);
    this.name = "HarnessError";
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new HarnessError(message);
  }
}

module.exports = {
  HarnessError,
  assert
};
