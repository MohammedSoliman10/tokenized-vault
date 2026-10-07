// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {Script, console} from "forge-std/Script.sol";
import {FaucetToken} from "../src/FaucetToken.sol";
import {Vault} from "../src/Vault.sol";

/// @title Deploy — deploys FaucetToken then Vault(faucetToken) (research D6)
/// @notice The signer is resolved by forge itself and never embedded here:
///         Sepolia via the PRIVATE_KEY env var (gitignored contracts/.env),
///         local Anvil via `--unlocked --sender <account>`. Only the deployed
///         addresses are printed.
contract Deploy is Script {
    function run() external {
        vm.startBroadcast();
        FaucetToken faucetToken = new FaucetToken();
        Vault vault = new Vault(address(faucetToken));
        vm.stopBroadcast();

        console.log("FaucetToken:", address(faucetToken));
        console.log("Vault:", address(vault));
    }
}
