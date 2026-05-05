#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

// Verifies that the version pinned in package.json, src-tauri/tauri.conf.json,
// and src-tauri/Cargo.toml all agree. Run before tagging a release so the
// installer, the bundle metadata, and the npm artifact all line up.
//
// Usage:
//   node scripts/check-versions.js          # exits 1 on mismatch
//   node scripts/check-versions.js --fix    # rewrites tauri.conf.json + Cargo.toml to match package.json

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

const FILES = {
  npm: path.join(ROOT, "package.json"),
  tauri: path.join(ROOT, "src-tauri", "tauri.conf.json"),
  cargo: path.join(ROOT, "src-tauri", "Cargo.toml"),
};

function readNpmVersion() {
  const pkg = JSON.parse(fs.readFileSync(FILES.npm, "utf8"));
  return pkg.version;
}

function readTauriVersion() {
  const cfg = JSON.parse(fs.readFileSync(FILES.tauri, "utf8"));
  return cfg.version;
}

function readCargoVersion() {
  const text = fs.readFileSync(FILES.cargo, "utf8");
  const match = /^version\s*=\s*"([^"]+)"/m.exec(text);
  if (!match) throw new Error("Cargo.toml: top-level version field not found");
  return match[1];
}

function writeTauriVersion(v) {
  const cfg = JSON.parse(fs.readFileSync(FILES.tauri, "utf8"));
  cfg.version = v;
  fs.writeFileSync(FILES.tauri, `${JSON.stringify(cfg, null, 2)}\n`);
}

function writeCargoVersion(v) {
  const text = fs.readFileSync(FILES.cargo, "utf8");
  const next = text.replace(/^version\s*=\s*"[^"]+"/m, `version = "${v}"`);
  fs.writeFileSync(FILES.cargo, next);
}

function main() {
  const fix = process.argv.includes("--fix");

  const npm = readNpmVersion();
  const tauri = readTauriVersion();
  const cargo = readCargoVersion();

  console.log(`package.json:    ${npm}`);
  console.log(`tauri.conf.json: ${tauri}`);
  console.log(`Cargo.toml:      ${cargo}`);

  if (npm === tauri && npm === cargo) {
    console.log("✓ versions agree");
    return;
  }

  if (!fix) {
    console.error("✗ versions disagree — run with --fix to align to package.json");
    process.exit(1);
  }

  console.log(`Aligning to package.json (${npm})…`);
  if (tauri !== npm) writeTauriVersion(npm);
  if (cargo !== npm) writeCargoVersion(npm);
  console.log("✓ updated");
}

main();
