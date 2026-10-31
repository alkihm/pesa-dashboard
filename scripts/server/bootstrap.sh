#!/usr/bin/env bash
# One-time toolchain setup on the home server, in the user's home folder (no sudo).
# Installs: Node 22 (nvm), pnpm (corepack), GitHub CLI, Supabase CLI.
# Run it on the server:  bash scripts/server/bootstrap.sh
set -euo pipefail

NVM_VERSION=v0.40.1
PNPM_VERSION=9.15.0
GH_VERSION=2.62.0
SUPABASE_VERSION=2.20.5
BIN="$HOME/.local/bin"
mkdir -p "$BIN"

export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash
fi
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm install 22
nvm alias default 22
corepack enable
corepack prepare "pnpm@${PNPM_VERSION}" --activate

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

if ! command -v gh >/dev/null 2>&1; then
  curl -fsSL -o "$tmp/gh.tgz" "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz"
  tar -xzf "$tmp/gh.tgz" -C "$tmp"
  install -m 755 "$tmp/gh_${GH_VERSION}_linux_amd64/bin/gh" "$BIN/gh"
fi

if ! command -v supabase >/dev/null 2>&1; then
  curl -fsSL -o "$tmp/supabase.tgz" "https://github.com/supabase/cli/releases/download/v${SUPABASE_VERSION}/supabase_linux_amd64.tar.gz"
  tar -xzf "$tmp/supabase.tgz" -C "$tmp" supabase
  install -m 755 "$tmp/supabase" "$BIN/supabase"
fi

grep -q 'HOME/.local/bin' "$HOME/.bashrc" || echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"

echo "node $(node -v) · pnpm $(pnpm -v) · $("$BIN/gh" --version | head -1) · supabase $("$BIN/supabase" --version)"
echo "Next: run 'gh auth login' once so both workspaces can push."
