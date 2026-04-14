/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * Parse a .env file string and return key-value pairs.
 * - Skips blank lines and # comments.
 * - Strips surrounding single or double quotes from values.
 * - Strips trailing inline comments only when preceded by whitespace (" #"),
 *   so bare # inside URLs (e.g. https://example.com#anchor) is preserved.
 * - Splits on the FIRST = only, so values containing = are preserved
 *   (e.g. POSTGRES_URL=postgres://...?sslmode=require).
 */
function parseEnvFile(content) {
  const result = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (!key) continue;
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip trailing inline comment — ONLY when preceded by whitespace.
    // This preserves bare # inside URL fragments (no leading space).
    const commentMatch = value.match(/\s#.*/);
    if (commentMatch) value = value.slice(0, commentMatch.index).trim();
    // Strip matching surrounding quotes
    value = value.replace(/^(['"])(.*)\1$/, "$2");
    result[key] = value;
  }
  return result;
}

/**
 * Load environment variables from .env files in the given directory.
 * Priority order: .env.local > .env
 * Returns a plain object; does NOT mutate process.env.
 */
function loadEnv(directory) {
  for (const filename of [".env.local", ".env"]) {
    const filePath = path.join(directory, filename);
    if (fs.existsSync(filePath)) {
      return parseEnvFile(fs.readFileSync(filePath, "utf8"));
    }
  }
  return {};
}

module.exports = { loadEnv, parseEnvFile };
