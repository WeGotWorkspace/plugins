#!/usr/bin/env node

import { createHash, createSign } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const pluginId = resolvePluginId(process.argv.slice(2));
const pluginRoot = resolve(repoRoot, pluginId);
const outputRoot = resolve(repoRoot, "dist/releases");
const stagingRoot = resolve(outputRoot, `wgw-plugin-${pluginId}`);

const version = resolveVersion(pluginRoot);
const packageName = `wgw-plugin-${pluginId}-${version}.zip`;
const packagePath = resolve(outputRoot, packageName);
const manifestPath = resolve(outputRoot, `wgw-plugin-${pluginId}-manifest.json`);
const signaturePath = resolve(outputRoot, `wgw-plugin-${pluginId}-manifest.sig`);

const pluginRuntimeRoot = resolve(stagingRoot, pluginId);
const pluginAssetsRoot = resolve(pluginRuntimeRoot, "assets");
const buildOut = resolveBuildOut(pluginRoot, pluginId);
const manifestSource = resolveManifestSource(pluginRoot, pluginId);

if (process.env.WGW_PLUGIN_SKIP_BUILD !== "1") {
  const filter = resolvePnpmFilter(pluginRoot, pluginId);
  execFileSync("pnpm", ["--filter", filter, "build"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

if (!existsSync(buildOut)) {
  throw new Error(`Missing plugin build output: ${relative(repoRoot, buildOut)}`);
}
if (!existsSync(manifestSource)) {
  throw new Error(`Missing plugin manifest: ${relative(repoRoot, manifestSource)}`);
}

ensureDir(outputRoot);
rmSafe(stagingRoot);
ensureDir(pluginAssetsRoot);
cpSync(buildOut, pluginAssetsRoot, { recursive: true });

const pluginManifest = JSON.parse(readFileSync(manifestSource, "utf8"));
if (pluginManifest.id !== undefined && String(pluginManifest.id) !== pluginId) {
  throw new Error(
    `Manifest id "${pluginManifest.id}" does not match plugin folder "${pluginId}"`,
  );
}
pluginManifest.id = pluginId;
pluginManifest.source = "installed";
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
console.log(`Plugin release written to ${relative(repoRoot, outputRoot)}`);
console.log(`  ${packageName}`);

function resolvePluginId(args) {
  const fromArg = args.find((arg) => !arg.startsWith("-"))?.trim();
  const fromEnv = process.env.PLUGIN_ID?.trim();
  const pluginId = fromArg || fromEnv;
  if (!pluginId) {
    throw new Error("Usage: node tools/build-plugin-release.mjs <plugin-id>");
  }
  return pluginId;
}

function resolveManifestSource(pluginRoot, id) {
  const candidates = [
    resolve(pluginRoot, `${id}.plugin.json`),
    resolve(pluginRoot, "plugin.json"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`No plugin manifest found under ${relative(repoRoot, pluginRoot)}`);
}

function resolveBuildOut(pluginRoot, id) {
  const fromEnv = process.env.PLUGIN_BUILD_OUT?.trim();
  if (fromEnv) {
    return resolve(pluginRoot, fromEnv);
  }
  return resolve(pluginRoot, "out");
}

function resolvePnpmFilter(pluginRoot, id) {
  const fromEnv = process.env.PLUGIN_PNPM_FILTER?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const packageJsonPath = resolve(pluginRoot, "package.json");
  if (existsSync(packageJsonPath)) {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    if (typeof pkg.name === "string" && pkg.name.trim() !== "") {
      return pkg.name.trim();
    }
  }
  return `@wgw/plugin-${id}`;
}

function resolveVersion(pluginRoot) {
  const fromEnv = process.env.WGW_RELEASE_VERSION?.trim();
  if (fromEnv) {
    return normalizeVersion(fromEnv);
  }
  const versionFile = resolve(pluginRoot, "VERSION");
  if (!existsSync(versionFile)) {
    throw new Error(`${relative(repoRoot, versionFile)} is missing`);
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
