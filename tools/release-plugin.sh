#!/usr/bin/env bash
# Build plugin release ZIPs and/or publish a signed tag (CI uploads GitHub Release assets).
#
#   pnpm release:onlyoffice                    # build + package onlyoffice
#   pnpm release:onlyoffice:publish patch      # bump VERSION, commit, signed tag, push
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_SCRIPT="$ROOT/tools/build-plugin-release.mjs"

usage() {
  cat <<'EOF'
usage:
  tools/release-plugin.sh <plugin-id> package [--skip-build]
  tools/release-plugin.sh <plugin-id> publish <patch|minor|major|X.Y.Z> [--yes] [--no-push] [--verify]

plugin-id  Folder name under the repo root (e.g. onlyoffice).

package    Run pnpm build for the plugin (unless --skip-build), then write
           dist/releases/wgw-plugin-<id>-<version>.zip using WGW_RELEASE_SIGNING_PRIVATE_KEY.

publish    Bump <plugin-id>/VERSION, commit, create signed annotated tag <id>-v*,
           and push branch + tag. GitHub Actions builds and uploads release assets.

options:
  --yes         Skip confirmation prompts (publish only).
  --no-push     Commit and tag locally but do not push (publish only).
  --verify      After bump, run package build before commit (publish only).
  --skip-build  Skip pnpm build (package, or publish --verify).
EOF
  exit 1
}

require_plugin() {
  local plugin_id="$1"
  [[ -n "$plugin_id" ]] || usage
  [[ -d "$ROOT/$plugin_id" ]] || {
    echo "error: plugin folder not found: $ROOT/$plugin_id" >&2
    exit 1
  }
  printf '%s' "$plugin_id"
}

require_clean_tree() {
  if [[ -n "$(git -C "$ROOT" status --porcelain)" ]]; then
    echo "error: working tree is not clean. Commit or stash changes first." >&2
    exit 1
  fi
}

version_file() {
  printf '%s/%s/VERSION' "$ROOT" "$1"
}

read_version() {
  local plugin_id="$1"
  local file
  file="$(version_file "$plugin_id")"
  [[ -f "$file" ]] || { echo "error: missing $file" >&2; exit 1; }
  tr -d '[:space:]' <"$file" | sed 's/^v//'
}

write_version() {
  local plugin_id="$1" version="$2"
  printf '%s\n' "$version" >"$(version_file "$plugin_id")"
}

bump_version() {
  local bump="$1" current="$2"
  node -e '
const bump = process.argv[1];
const current = process.argv[2].replace(/^v/, "");
const explicit = /^\d+\.\d+\.\d+$/;
if (explicit.test(bump)) {
  console.log(bump);
  process.exit(0);
}
const parts = current.split(".").map((n) => Number.parseInt(n, 10));
if (parts.length !== 3 || parts.some(Number.isNaN)) {
  console.error("error: VERSION must be semver (X.Y.Z)");
  process.exit(1);
}
let [major, minor, patch] = parts;
switch (bump) {
  case "patch":
    patch += 1;
    break;
  case "minor":
    minor += 1;
    patch = 0;
    break;
  case "major":
    major += 1;
    minor = 0;
    patch = 0;
    break;
  default:
    console.error("error: bump must be patch, minor, major, or X.Y.Z");
    process.exit(1);
}
console.log(`${major}.${minor}.${patch}`);
' "$bump" "$current"
}

run_build() {
  local plugin_id="$1"
  echo "→ pnpm --filter @wgw/plugin-${plugin_id} build"
  (cd "$ROOT" && pnpm --filter "@wgw/plugin-${plugin_id}" build)
}

run_package() {
  local plugin_id="$1"
  echo "→ node tools/build-plugin-release.mjs ${plugin_id}"
  (cd "$ROOT" && PLUGIN_ID="$plugin_id" node "$BUILD_SCRIPT" "$plugin_id")
}

ensure_signing_key() {
  if [[ -z "${WGW_RELEASE_SIGNING_PRIVATE_KEY:-}" ]]; then
    echo "warning: WGW_RELEASE_SIGNING_PRIVATE_KEY is not set; manifest.sig will be omitted." >&2
    echo "         Add it to repo-root .env for signed artifacts." >&2
  fi
}

GIT_TAG_SIGN_ARGS=()

expand_home() {
  local path="$1"
  if [[ "$path" == "~/"* ]]; then
    printf '%s/%s' "$HOME" "${path:2}"
  elif [[ "$path" == "~" ]]; then
    printf '%s' "$HOME"
  else
    printf '%s' "$path"
  fi
}

resolve_git_tag_signing() {
  GIT_TAG_SIGN_ARGS=()

  local from_env="${WGW_GIT_SIGNING_PUBLIC_KEY:-}"
  if [[ -n "$from_env" ]]; then
    from_env="$(expand_home "$from_env")"
    if [[ ! -f "$from_env" ]]; then
      echo "error: WGW_GIT_SIGNING_PUBLIC_KEY is set but not a file: ${from_env}" >&2
      exit 1
    fi
    GIT_TAG_SIGN_ARGS=(-c gpg.format=ssh -c "user.signingkey=${from_env}")
    return 0
  fi

  local from_git
  from_git="$(git -C "$ROOT" config --get user.signingkey 2>/dev/null || true)"
  if [[ -n "$from_git" ]]; then
    local format="gpg"
    format="$(git -C "$ROOT" config --get gpg.format 2>/dev/null || echo gpg)"
    GIT_TAG_SIGN_ARGS=(-c "gpg.format=${format}" -c "user.signingkey=${from_git}")
    return 0
  fi

  cat >&2 <<'EOF'
error: Git tag signing is not configured (CI requires signed annotated tags).

Release ZIP signing and Git tag signing use different keys:
  • WGW_RELEASE_SIGNING_PRIVATE_KEY — RSA PEM for manifest.sig (release artifacts)
  • WGW_GIT_SIGNING_PUBLIC_KEY       — SSH public key for git tag -s

Option A — add to repo-root .env:
  WGW_GIT_SIGNING_PUBLIC_KEY=$HOME/.ssh/id_ed25519.pub

Option B — configure git globally (SSH):
  git config --global gpg.format ssh
  git config --global user.signingkey ~/.ssh/id_ed25519.pub
EOF
  exit 1
}

git_tag_sign() {
  git -C "$ROOT" "${GIT_TAG_SIGN_ARGS[@]}" "$@"
}

cmd_package() {
  local plugin_id="$1"
  shift
  local skip_build=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --skip-build) skip_build=1 ;;
      *) usage ;;
    esac
    shift
  done
  [[ $# -eq 0 ]] || usage

  ensure_signing_key
  if [[ "$skip_build" -eq 0 ]]; then
    run_build "$plugin_id"
  fi
  run_package "$plugin_id"
}

cmd_publish() {
  local plugin_id="$1" bump="$2"
  shift 2
  local yes=0 no_push=0 verify=0 skip_build=0
  [[ -n "$bump" ]] || usage
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --yes) yes=1 ;;
      --no-push) no_push=1 ;;
      --verify) verify=1 ;;
      --skip-build) skip_build=1 ;;
      *) usage ;;
    esac
    shift
  done
  [[ $# -eq 0 ]] || usage

  require_clean_tree
  resolve_git_tag_signing

  local current new tag version_file_path
  current="$(read_version "$plugin_id")"
  new="$(bump_version "$bump" "$current")"
  tag="${plugin_id}-v${new}"
  version_file_path="$(version_file "$plugin_id")"

  if [[ "$current" == "$new" && "$bump" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "error: VERSION is already ${new}" >&2
    exit 1
  fi

  echo "Release ${plugin_id}: ${current} → ${new} (${tag})"
  if [[ "$yes" -eq 0 ]]; then
    read -r -p "Continue? [y/N] " reply
    [[ "${reply,,}" == "y" || "${reply,,}" == "yes" ]] || { echo "Aborted."; exit 0; }
  fi

  write_version "$plugin_id" "$new"
  export WGW_RELEASE_VERSION="$new"

  if [[ "$verify" -eq 1 ]]; then
    ensure_signing_key
    if [[ "$skip_build" -eq 0 ]]; then
      run_build "$plugin_id"
    fi
    run_package "$plugin_id"
  fi

  git -C "$ROOT" add "$version_file_path"
  if [[ -f "$ROOT/$plugin_id/package.json" ]]; then
    node -e '
const fs = require("node:fs");
const path = process.argv[1];
const version = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
pkg.version = version;
fs.writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
' "$ROOT/$plugin_id/package.json" "$new"
    git -C "$ROOT" add "$ROOT/$plugin_id/package.json"
  fi

  git -C "$ROOT" commit -m "chore(release): ${tag}"
  git_tag_sign tag -s "$tag" -m "chore(release): ${tag}"

  echo "→ Created commit and signed tag ${tag}"
  if [[ "$no_push" -eq 1 ]]; then
    echo "Skipped push (--no-push). When ready:"
    echo "  git push origin HEAD && git push origin ${tag}"
    exit 0
  fi

  local branch
  branch="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
  echo "→ git push origin ${branch}"
  git -C "$ROOT" push origin "HEAD:${branch}"
  echo "→ git push origin ${tag}"
  git -C "$ROOT" push origin "$tag"
  echo "Done. GitHub Actions will build and publish release assets for ${tag}."
}

[[ $# -ge 2 ]] || usage
plugin_id="$(require_plugin "$1")"
command="$2"
shift 2

case "$command" in
  package) cmd_package "$plugin_id" "$@" ;;
  publish) cmd_publish "$plugin_id" "$@" ;;
  -h | --help | help) usage ;;
  *) usage ;;
esac
