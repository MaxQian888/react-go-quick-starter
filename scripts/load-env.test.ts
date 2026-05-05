/** @jest-environment node */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseEnvFile, loadEnv } = require("./load-env");

describe("parseEnvFile", () => {
  test("parses simple key=value pairs", () => {
    expect(parseEnvFile("PORT=3000\nHOST=localhost")).toEqual({
      PORT: "3000",
      HOST: "localhost",
    });
  });

  test("skips blank lines", () => {
    expect(parseEnvFile("\n\nPORT=3000\n\n")).toEqual({ PORT: "3000" });
  });

  test("skips # comment lines", () => {
    expect(parseEnvFile("# comment\nPORT=3000")).toEqual({ PORT: "3000" });
  });

  test("strips double quotes from value", () => {
    expect(parseEnvFile('SECRET="my secret"')).toEqual({
      SECRET: "my secret",
    });
  });

  test("strips single quotes from value", () => {
    expect(parseEnvFile("SECRET='my secret'")).toEqual({
      SECRET: "my secret",
    });
  });

  test("strips inline comments separated by space-hash", () => {
    expect(parseEnvFile("PORT=3000 # Next.js port")).toEqual({
      PORT: "3000",
    });
  });

  test("does NOT strip # that appears inside a URL value", () => {
    // Bare # inside a value (no leading space) must be preserved
    expect(parseEnvFile("CALLBACK_URL=https://example.com/auth#done")).toEqual({
      CALLBACK_URL: "https://example.com/auth#done",
    });
  });

  test("handles values containing = sign (e.g. connection strings)", () => {
    expect(
      parseEnvFile("POSTGRES_URL=postgres://user:pass@localhost:5432/db?sslmode=require"),
    ).toEqual({
      POSTGRES_URL: "postgres://user:pass@localhost:5432/db?sslmode=require",
    });
  });

  test("handles empty value", () => {
    expect(parseEnvFile("EMPTY=")).toEqual({ EMPTY: "" });
  });

  test("ignores lines without equals sign", () => {
    expect(parseEnvFile("NOEQUALSSIGN\nPORT=3000")).toEqual({ PORT: "3000" });
  });
});

describe("loadEnv", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "load-env-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  test("returns empty object when no env files exist", () => {
    expect(loadEnv(tmpDir)).toEqual({});
  });

  test("loads .env when .env.local is absent", () => {
    fs.writeFileSync(path.join(tmpDir, ".env"), "PORT=3000");
    expect(loadEnv(tmpDir)).toEqual({ PORT: "3000" });
  });

  test("prefers .env.local over .env", () => {
    fs.writeFileSync(path.join(tmpDir, ".env"), "PORT=3000");
    fs.writeFileSync(path.join(tmpDir, ".env.local"), "PORT=4000");
    expect(loadEnv(tmpDir)).toEqual({ PORT: "4000" });
  });

  test("returns empty object when directory has other files but no env files", () => {
    fs.writeFileSync(path.join(tmpDir, "other.txt"), "hello");
    expect(loadEnv(tmpDir)).toEqual({});
  });
});
