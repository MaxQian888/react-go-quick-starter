#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { execFileSync, spawnSync, execSync } = require("node:child_process");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const CONTAINERS = ["rg-starter-postgres", "rg-starter-redis"];
const HEALTH_TIMEOUT_MS = 60_000;
const HEALTH_POLL_MS = 2_000;

/**
 * Synchronous sleep via execSync.
 * Works reliably on all platforms without Atomics/SharedArrayBuffer quirks.
 * On Windows uses `ping -n 2 127.0.0.1` (adds ~1s per call).
 * On Unix uses `sleep <seconds>`.
 */
function sleep(ms) {
  const secs = Math.max(1, Math.round(ms / 1000));
  if (process.platform === "win32") {
    execSync(`ping -n ${secs + 1} 127.0.0.1 > nul`, { stdio: "ignore" });
  } else {
    execSync(`sleep ${secs}`, { stdio: "ignore" });
  }
}

/** Exit with a clear message if Docker is not available. */
function requireDocker() {
  const result = spawnSync("docker", ["info"], { stdio: "ignore" });
  if (result.status !== 0) {
    console.error("Error: Docker is not running. Please start Docker Desktop and try again.");
    process.exit(1);
  }
}

/**
 * Returns the health status string for a container, or null if the
 * container does not exist (docker inspect exits non-zero).
 * Note: containers without a HEALTHCHECK directive return an empty string —
 * these are treated as not-healthy. Both postgres and redis in docker-compose.yml
 * define HEALTHCHECK so this project is not affected.
 */
function getContainerHealth(name) {
  const result = spawnSync("docker", ["inspect", "--format", "{{.State.Health.Status}}", name], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return null; // container absent
  return result.stdout.trim(); // 'healthy' | 'unhealthy' | 'starting' | ''
}

/** Returns true when every target container reports 'healthy'. */
function allHealthy() {
  return CONTAINERS.every((name) => getContainerHealth(name) === "healthy");
}

/**
 * Polls until all containers are healthy or the timeout is reached.
 * Exits the process with code 1 on timeout.
 */
function waitForHealthy() {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  process.stdout.write("Waiting for services");
  while (Date.now() < deadline) {
    if (allHealthy()) {
      process.stdout.write("\n");
      return;
    }
    process.stdout.write(".");
    sleep(HEALTH_POLL_MS);
  }
  process.stdout.write("\n");
  console.error("Error: Timed out waiting for services to become healthy (60s).");
  process.exit(1);
}

function cmdUp() {
  requireDocker();
  console.log("Starting Docker services...");
  execFileSync("docker", ["compose", "up", "-d"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
  waitForHealthy();
  console.log("All services are healthy.");
}

function cmdDown() {
  requireDocker();
  execFileSync("docker", ["compose", "down"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
}

/**
 * Checks if all containers are healthy; if not, runs cmdUp.
 * docker compose up -d is idempotent — it handles absent, stopped,
 * and already-running containers correctly without separate checks.
 */
function cmdEnsure() {
  requireDocker();
  if (allHealthy()) {
    console.log("Services already running and healthy.");
    return;
  }
  console.log("Services not ready — starting...");
  cmdUp();
}

const COMMANDS = { up: cmdUp, down: cmdDown, ensure: cmdEnsure };

function main(argv = process.argv.slice(2)) {
  const cmd = argv[0];
  if (!cmd || !(cmd in COMMANDS)) {
    console.error(`Usage: node scripts/services.js <${Object.keys(COMMANDS).join("|")}>`);
    process.exit(1);
  }
  COMMANDS[cmd]();
}

if (require.main === module) {
  main();
}

module.exports = { getContainerHealth, allHealthy, CONTAINERS };
