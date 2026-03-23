import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "../..");
const APP_DIR = resolve(ROOT, "..", "app");

describe("config consistency between tauri.conf.json and dev-stable.js", () => {
  const tauriConf = JSON.parse(
    readFileSync(resolve(APP_DIR, "tauri.conf.json"), "utf8"),
  );

  // Extract PORT from dev-stable.js source
  const devStableSrc = readFileSync(
    resolve(ROOT, "scripts/dev-stable.js"),
    "utf8",
  );
  const portMatch = devStableSrc.match(/const PORT\s*=\s*(\d+)/);
  const devStablePort = portMatch ? Number(portMatch[1]) : null;

  it("dev-stable.js PORT is defined", () => {
    assert.ok(devStablePort, "Could not find PORT constant in dev-stable.js");
  });

  it("tauri.conf.json devUrl uses the same port as dev-stable.js", () => {
    const devUrl = tauriConf.build?.devUrl;
    assert.ok(devUrl, "tauri.conf.json must have build.devUrl");
    assert.ok(
      devUrl.includes(`:${devStablePort}`),
      `devUrl "${devUrl}" should reference port ${devStablePort}`,
    );
  });

  it("tauri.conf.json has beforeDevCommand", () => {
    const cmd = tauriConf.build?.beforeDevCommand;
    assert.ok(cmd, "tauri.conf.json must have build.beforeDevCommand");
  });

  it("beforeDevCommand references pnpm dev:stable", () => {
    const cmd = tauriConf.build?.beforeDevCommand;
    assert.ok(cmd, "beforeDevCommand must be defined");
    assert.ok(
      cmd.includes("pnpm dev:stable"),
      `beforeDevCommand "${cmd}" should run pnpm dev:stable`,
    );
  });

  it("tauri.conf.json frontendDist is set for production", () => {
    const dist = tauriConf.build?.frontendDist;
    assert.ok(dist, "tauri.conf.json must have build.frontendDist for production");
  });

  it("tauri.conf.json externalBin includes node for production", () => {
    const bins = tauriConf.bundle?.externalBin;
    assert.ok(bins, "tauri.conf.json must have bundle.externalBin");
    assert.ok(
      bins.some((b) => b.includes("node")),
      "externalBin should include a node binary entry",
    );
  });
});
