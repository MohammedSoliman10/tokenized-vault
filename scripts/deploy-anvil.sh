#!/usr/bin/env bash
set -euo pipefail

# Deploy FaucetToken + Vault to a LOCAL Anvil node (chainId 31337).
# Signs through Anvil's unlocked default account #0 via `--unlocked` — no
# private key exists anywhere in this repo (secret-hygiene gate scans tracked
# files for 0x + 64-hex literals; the sender ADDRESS below is 40 hex on purpose).

ANVIL_SENDER="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR/../contracts"
forge script script/Deploy.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --unlocked \
  --sender "$ANVIL_SENDER" \
  --broadcast
