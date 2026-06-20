class TestRunner {
  constructor() {
    this.results = [];
  }

  async run(name, testFn) {
    try {
      await testFn();
      this.results.push({ name, ok: true });
      console.log(`PASS  ${name}`);
    } catch (error) {
      this.results.push({ name, ok: false, error: error.message });
      console.log(`FAIL  ${name}`);
      console.log(`      ${error.message}`);
    }
  }

  finish() {
    const failed = this.results.filter((item) => !item.ok);
    const passed = this.results.length - failed.length;

    console.log("\n=== P2P Harness Summary ===");
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed.length}`);

    if (failed.length > 0) {
      process.exitCode = 1;
    }
  }
}

module.exports = {
  TestRunner
};
