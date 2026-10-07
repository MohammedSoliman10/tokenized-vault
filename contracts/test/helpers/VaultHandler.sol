// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {Test} from "forge-std/Test.sol";
import {Vault} from "../../src/Vault.sol";
import {FaucetToken} from "../../src/FaucetToken.sol";

/// @title VaultHandler — invariant handler: deposit, withdraw, donate, warp
/// @notice Maintains `ghost_sumShares` = sum of ALL Vault share balances (incl. the dead
///         address) so the suite can assert `totalSupply == sum(all balances)`.
contract VaultHandler is Test {
    Vault public immutable vault;
    FaucetToken public immutable token;

    address[] public actors;
    uint256 public ghost_sumShares;

    constructor(Vault vault_, FaucetToken token_, address[] memory actors_) {
        vault = vault_;
        token = token_;
        actors = actors_;
    }

    /// @dev Seed each actor (and the handler itself for donations) with 10_000e18 tokens
    ///      and a max vault approval. Called once from the test's setUp.
    function seed() external {
        for (uint256 i; i < actors.length; ++i) {
            address who = actors[i];
            for (uint256 j; j < 10; ++j) {
                vm.prank(who);
                token.faucet();
                vm.warp(block.timestamp + 1 days);
            }
            vm.prank(who);
            token.approve(address(vault), type(uint256).max);
        }
        for (uint256 j; j < 10; ++j) {
            token.faucet();
            vm.warp(block.timestamp + 1 days);
        }
    }

    function deposit(uint256 actorSeed, uint256 amount) external {
        address who = actors[actorSeed % actors.length];
        uint256 bal = token.balanceOf(who);
        if (bal == 0) return;

        bool wasEmpty = vault.totalSupply() == 0;
        if (wasEmpty) {
            amount = bound(amount, 1001, bal); // bootstrap requires > 1000 base units
        } else {
            amount = bound(amount, 1, bal);
            // skip amounts that would floor to ZeroShares and revert
            uint256 expected = (amount * vault.totalSupply()) / token.balanceOf(address(vault));
            if (expected == 0) return;
        }

        vm.prank(who);
        uint256 shares = vault.deposit(amount);

        ghost_sumShares += shares;
        if (wasEmpty) ghost_sumShares += 1000; // dead-share slice minted at bootstrap
    }

    function withdraw(uint256 actorSeed, uint256 shareAmount) external {
        address who = actors[actorSeed % actors.length];
        uint256 held = vault.balanceOf(who);
        if (held == 0) return;
        shareAmount = bound(shareAmount, 1, held);

        vm.prank(who);
        vault.withdraw(shareAmount);

        ghost_sumShares -= shareAmount;
    }

    function donate(uint256 amount) external {
        uint256 bal = token.balanceOf(address(this));
        if (bal == 0) return;
        amount = bound(amount, 1, bal);
        token.transfer(address(vault), amount); // direct transfer: balance > totalSupply
    }

    function warp(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 1, 1 days));
    }
}
