#!/usr/bin/env bash
set -euo pipefail

# Deploy FaucetToken + Vault to a LOCAL Anvil node (chainId 31337).
# PRIVATE_KEY = Anvil's publicly documented default account #0 (safe-by-design:
# public constant that only exists on a local node — not a secret).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

cd "$SCRIPT_DIR/../contracts"
forge script script/Deploy.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast
