#!/usr/bin/env node

import { createHash, createSign } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const pluginRoot = resolve(repoRoot, "onlyoffice");
const outputRoot = resolve(repoRoot, "dist/releases");
const stagingRoot = resolve(outputRoot, "wgw-plugin-onlyoffice");

const pluginId = "onlyoffice";
const version = resolveVersion();
const packageName = `wgw-plugin-${pluginId}-${version}.zip`;
const packagePath = resolve(outputRoot, packageName);
const manifestPath = resolve(outputRoot, `wgw-plugin-${pluginId}-manifest.json`);
const signaturePath = resolve(outputRoot, `wgw-plugin-${pluginId}-manifest.sig`);

const pluginRuntimeRoot = resolve(stagingRoot, pluginId);
const pluginAssetsRoot = resolve(pluginRuntimeRoot, "assets");
const buildOut = resolve(pluginRoot, "out");
const manifestSource = resolve(pluginRoot, "onlyoffice.plugin.json");

if (process.env.WGW_PLUGIN_SKIP_BUILD !== "1") {
  execFileSync("pnpm", ["--filter", "@wgw/plugin-onlyoffice", "build"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

if (!existsSync(buildOut)) {
  throw new Error(`Missing ONLYOFFICE build output: ${relative(repoRoot, buildOut)}`);
}
if (!existsSync(manifestSource)) {
  throw new Error(`Missing plugin manifest: ${relative(repoRoot, manifestSource)}`);
}

ensureDir(outputRoot);
rmSafe(stagingRoot);
ensureDir(pluginAssetsRoot);
cpSync(buildOut, pluginAssetsRoot, { recursive: true });

const pluginManifest = JSON.parse(readFileSync(manifestSource, "utf8"));
pluginManifest.source = "runtime";
writeFileSync(resolve(pluginRuntimeRoot, "plugin.json"), `${JSON.stringify(pluginManifest, null, 2)}\n`, "utf8");

zipDirectory(stagingRoot, packagePath);
const checksum = sha256File(packagePath);

let checksumSignature = "";
const privateKey = process.env.WGW_RELEASE_SIGNING_PRIVATE_KEY?.trim() ?? "";
if (privateKey !== "") {
  const checksumSigner = createSign("RSA-SHA256");
  checksumSigner.update(checksum);
  checksumSigner.end();
  checksumSignature = checksumSigner.sign(privateKey).toString("base64");
}

const releaseManifest = {
  name: `wgw-plugin-${pluginId}`,
  plugin_id: pluginId,
  version,
  package_name: packageName,
  package_url: "",
  checksum_sha256: checksum,
  checksum_signature: checksumSignature,
  released_at: new Date().toISOString(),
  source_repo: "https://github.com/WeGotWorkspace/plugins",
};
const releaseManifestContent = `${JSON.stringify(releaseManifest, null, 2)}\n`;
writeFileSync(manifestPath, releaseManifestContent, "utf8");

if (privateKey !== "") {
  const signer = createSign("RSA-SHA256");
  signer.update(releaseManifestContent);
  signer.end();
  writeFileSync(signaturePath, `${signer.sign(privateKey).toString("base64")}\n`, "utf8");
}

rmSafe(stagingRoot);
console.log(`ONLYOFFICE plugin release written to ${relative(repoRoot, outputRoot)}`);

function resolveVersion() {
  const fromEnv = process.env.WGW_RELEASE_VERSION?.trim();
  if (fromEnv) {
    return normalizeVersion(fromEnv);
  }
  const versionFile = resolve(pluginRoot, "VERSION");
  if (!existsSync(versionFile)) {
    throw new Error("onlyoffice/VERSION is missing");
  }
  return normalizeVersion(readFileSync(versionFile, "utf8"));
}

function normalizeVersion(version) {
  const trimmed = version.trim();
  return trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function rmSafe(path) {
  try {
    execFileSync("rm", ["-rf", path], { stdio: "ignore" });
  } catch {
    // no-op
  }
}

function zipDirectory(sourceDir, outputZip) {
  rmSafe(outputZip);
  execFileSync("zip", ["-rq", outputZip, "."], { cwd: sourceDir, stdio: "inherit" });
}

function sha256File(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}
