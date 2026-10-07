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
# Gas headroom: Sepolia activated the Glamsterdam fork (Oct 6, 2026: EIP-8037
# state-creation gas increase, EIP-7976 calldata floor, EIP-2780 intrinsic gas)
# while this Foundry simulates pre-fork `osaka`, so local estimates understate
# on-chain cost by ~6.9x (measured via eth_estimateGas: 7,195,156 / 5,067,365
# needed vs 1,045,657 / 733,600 local). Default 130% multiplier once OOG'd both
# creates (blocks 11865461/11865462, nonce 120-123); -g 1100 (~11x local,
# ~60% margin over measured chain truth) stays under the EIP-7825 16.7M cap.
forge script script/Deploy.s.sol \
  --rpc-url "$SEPOLIA_RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  -g 1100 \
  --broadcast \
  --verify \
  --etherscan-api-key "$ETHERSCAN_API_KEY"
