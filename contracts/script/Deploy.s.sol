// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {Script, console} from "forge-std/Script.sol";
import {FaucetToken} from "../src/FaucetToken.sol";
import {Vault} from "../src/Vault.sol";

/// @title Deploy — deploys FaucetToken then Vault(faucetToken) (research D6)
/// @notice The deployer key is read from the PRIVATE_KEY env var and NEVER logged;
///         only the deployed addresses are printed.
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY"); // never logged

        vm.startBroadcast(deployerKey);
        FaucetToken faucetToken = new FaucetToken();
        Vault vault = new Vault(address(faucetToken));
        vm.stopBroadcast();

        console.log("FaucetToken:", address(faucetToken));
        console.log("Vault:", address(vault));
    }
}
