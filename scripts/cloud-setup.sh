#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Use the repository's runtime when the environment provides nvm.
if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  nvm install
  nvm use
fi

node --input-type=module -e '
const [major, minor] = process.versions.node.split(".").map(Number);
if (major !== 22 || minor < 13) {
  throw new Error("Set the cloud environment Node.js version to 22.18.0 (Node 22.13+).");
}
'
npm ci --no-audit --no-fund
mkdir -p .wrangler/logs .wrangler/registry
echo "Dependencies installed. Validate with npm run cloud:check and npm run cloud:smoke."
