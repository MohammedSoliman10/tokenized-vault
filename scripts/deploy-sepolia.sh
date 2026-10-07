#!/usr/bin/env bash
set -euo pipefail

# Deploy FaucetToken + Vault to Sepolia (chainId 11155111) with source verification.
# Loads PRIVATE_KEY / SEPOLIA_RPC_URL / ETHERSCAN_API_KEY from gitignored contracts/.env.
# No `set -x`, no echoing of values — secrets are never printed or logged.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

set -a
source "$SCRIPT_DIR/../contracts/.env"
set +a

cd "$SCRIPT_DIR/../contracts"
forge script script/Deploy.s.sol \
  --rpc-url "$SEPOLIA_RPC_URL" \
  --broadcast \
  --verify \
  --etherscan-api-key "$ETHERSCAN_API_KEY"
