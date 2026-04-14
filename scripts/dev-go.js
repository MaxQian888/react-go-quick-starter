#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { loadEnv } = require("./load-env");

const REPO_ROOT = path.resolve(__dirname, "..");
const GO_DIR = path.join(REPO_ROOT, "src-go");

function run() {
  // Load env from root .env.local / .env (process.env wins over file values)
  const fileEnv = loadEnv(REPO_ROOT);
  const mergedEnv = { ...fileEnv, ...process.env };

  // Map BACKEND_PORT → PORT so Go reads the right port.
  // This avoids conflict with Next.js which also reads PORT.
  const goPort = mergedEnv.BACKEND_PORT || mergedEnv.PORT || "7777";
  const goEnv = { ...mergedEnv, PORT: goPort };

  console.log(`Starting Go backend on port ${goPort}...`);

  const result = spawnSync("go", ["run", "./cmd/server"], {
    cwd: GO_DIR,
    env: goEnv,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`Failed to start Go backend: ${result.error.message}`);
  }

  process.exit(result.status ?? 1);
}

if (require.main === module) {
  run();
}
