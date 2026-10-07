// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {VaultTestBase} from "./VaultTestBase.sol";
import {Vault} from "../src/Vault.sol";
import {VaultHandler} from "./helpers/VaultHandler.sol";

/// @title VaultInvariantTest — constitution-required solvency + supply-sum invariants
contract VaultInvariantTest is VaultTestBase {
    VaultHandler internal handler;

    function setUp() public override {
        super.setUp();

        address[] memory actors = new address[](3);
        actors[0] = alice;
        actors[1] = bob;
        actors[2] = carol;

        handler = new VaultHandler(vault, token, actors);
        handler.seed();

        bytes4[] memory selectors = new bytes4[](4);
        selectors[0] = VaultHandler.deposit.selector;
        selectors[1] = VaultHandler.withdraw.selector;
        selectors[2] = VaultHandler.donate.selector;
        selectors[3] = VaultHandler.warp.selector;

        targetContract(address(handler));
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    /// (1) SOLVENCY (constitution Principle II, verbatim):
    ///     token.balanceOf(vault) >= value of all non-dead shares.
    ///     Value is checked both as the redeemable amount at the current share price and,
    ///     more strongly, as at least 1 base unit of backing per non-dead share.
    function invariant_solvency() public view {
        uint256 supply = vault.totalSupply();
        uint256 balance = token.balanceOf(address(vault));
        uint256 deadShares = vault.balanceOf(DEAD_ADDRESS);
        uint256 nonDead = supply - deadShares;

        if (supply > 0) {
            uint256 redeemable = (nonDead * balance) / supply;
            assertLe(redeemable, balance, "solvency: vault balance < value of non-dead shares");
        }
        assertGe(balance, nonDead, "solvency: vault balance < non-dead share count");
    }

    /// (2) totalSupply == sum of all balances, including the dead address (ghost-tracked).
    function invariant_totalSupplyEqualsSumOfBalances() public view {
        assertEq(
            vault.totalSupply(), handler.ghost_sumShares(), "totalSupply != sum of all balances incl. dead address"
        );
    }

    /// Supporting check: donations can only ever raise the backing ratio.
    function invariant_balanceCoversTotalSupply() public view {
        assertGe(token.balanceOf(address(vault)), vault.totalSupply(), "vault token balance fell below totalSupply");
    }
}
