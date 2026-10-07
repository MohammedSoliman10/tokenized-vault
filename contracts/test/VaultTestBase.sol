// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {Test} from "forge-std/Test.sol";
import {Vault} from "../src/Vault.sol";
import {FaucetToken} from "../src/FaucetToken.sol";

/// @title VaultTestBase — shared fixture for all Vault suites (unit/fuzz/invariant/reentrancy)
/// @notice Deploys a fresh FaucetToken + Vault and provides funded-actor helpers.
abstract contract VaultTestBase is Test {
    Vault internal vault;
    FaucetToken internal token;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint256 internal constant DEAD_SHARES = 1000;
    address internal constant DEAD_ADDRESS = address(0xdead);

    function setUp() public virtual {
        token = new FaucetToken();
        vault = new Vault(address(token));
    }

    /// @dev Claims from the faucet enough times to cover `amount`, then approves the vault
    ///      for the actor (one claim = 1000e18, 24h cooldown advanced via vm.warp).
    function _fund(address who, uint256 amount) internal {
        uint256 claimAmt = token.FAUCET_AMOUNT();
        uint256 claims = (amount + claimAmt - 1) / claimAmt;
        for (uint256 i; i < claims; ++i) {
            vm.prank(who);
            token.faucet();
            vm.warp(block.timestamp + 1 days);
        }
        vm.prank(who);
        token.approve(address(vault), type(uint256).max);
    }

    /// @dev Deposit `amount` from `who`, returning the minted shares.
    function _deposit(address who, uint256 amount) internal returns (uint256 shares) {
        vm.prank(who);
        shares = vault.deposit(amount);
    }

    /// @dev Withdraw `shares` from `who`, returning the token amount.
    function _withdraw(address who, uint256 sharesAmt) internal returns (uint256 amount) {
        vm.prank(who);
        amount = vault.withdraw(sharesAmt);
    }
}
