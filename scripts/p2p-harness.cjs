#!/usr/bin/env node

const { runHarness } = require("./p2p/scenario.cjs");

runHarness().catch((error) => {
  console.error(error);
  process.exit(1);
});
