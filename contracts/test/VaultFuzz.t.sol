// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {VaultTestBase} from "./VaultTestBase.sol";
import {Vault} from "../src/Vault.sol";

/// @title VaultFuzz — fuzz: round trips, share math, monotonicity, first-deposit boundary
contract VaultFuzzTest is VaultTestBase {
    uint256 internal constant MAX_AMT = 1e21; // ≤ 1 faucet claim per funder keeps runs fast

    /// @dev deposit→withdraw round trip returns the deposit minus at most the dead-share
    ///      slice plus floor-rounding dust (single depositor: exactly `amount - 1000`).
    function testFuzz_roundTrip_singleDepositor_withinFloorTolerance(uint256 amount) public {
        amount = bound(amount, DEAD_SHARES + 1, MAX_AMT);
        _fund(alice, amount);

        uint256 shares = _deposit(alice, amount);
        uint256 returned = _withdraw(alice, shares);

        assertEq(returned, amount - DEAD_SHARES, "single round trip loses exactly dead slice");
        assertLe(amount - returned, DEAD_SHARES, "loss must stay within dead-share tolerance");
        assertEq(token.balanceOf(address(vault)), DEAD_SHARES, "vault keeps dead backing");
        assertEq(vault.totalSupply(), DEAD_SHARES);
    }

    /// @dev Round trip after a donation (balance ≠ supply): returned amount never exceeds
    ///      what was deposited, and shortfalls stay inside floor-rounding tolerance.
    function testFuzz_roundTrip_afterDonation_withinFloorTolerance(
        uint256 a,
        uint256 b,
        uint256 d
    ) public {
        a = bound(a, DEAD_SHARES + 1, MAX_AMT);
        d = bound(d, 0, a); // donation bounded by the bootstrapped supply
        b = bound(b, 2, MAX_AMT);

        _fund(alice, a);
        _deposit(alice, a);

        if (d > 0) {
            _fund(carol, d);
            vm.prank(carol);
            token.transfer(address(vault), d); // direct donation: balance > totalSupply
        }

        _fund(bob, b);
        uint256 shares = _deposit(bob, b);
        uint256 returned = _withdraw(bob, shares);

        assertLe(returned, b, "round trip must never profit");
        assertLe(b - returned, 10, "shortfall must stay within floor-rounding tolerance");
        // solvency of the remaining holders after bob's exit
        assertGe(
            token.balanceOf(address(vault)),
            vault.totalSupply() - vault.balanceOf(DEAD_ADDRESS),
            "vault must still cover non-dead shares"
        );
    }

    /// @dev shares == amount * totalSupply / balance (floor) for fuzzed supplies/balances.
    function testFuzz_shareMath_matchesFloorFormula(uint256 a, uint256 y, uint256 d) public {
        a = bound(a, DEAD_SHARES + 1, MAX_AMT);
        d = bound(d, 0, a);
        y = bound(y, 2, MAX_AMT);

        _fund(alice, a);
        _deposit(alice, a);

        if (d > 0) {
            _fund(carol, d);
            vm.prank(carol);
            token.transfer(address(vault), d);
        }

        uint256 expected = (y * vault.totalSupply()) / token.balanceOf(address(vault));
        _fund(bob, y);
        uint256 shares = _deposit(bob, y);

        assertEq(shares, expected, "shares must equal floor(amount * supply / balance)");
        assertLe(shares, y, "with balance >= supply a deposit can never mint more than 1:1");
    }

    /// @dev Larger deposits from the same state never mint fewer shares (monotonicity).
    function testFuzz_monotonicity_largerDepositNeverFewerShares(
        uint256 base,
        uint256 d1,
        uint256 delta
    ) public {
        base = bound(base, DEAD_SHARES + 1, MAX_AMT);
        d1 = bound(d1, 1, MAX_AMT / 2);
        delta = bound(delta, 1, MAX_AMT / 2);

        _fund(alice, base);
        _deposit(alice, base);

        _fund(bob, d1 + delta);

        uint256 snap = vm.snapshotState();
        uint256 shares1 = _deposit(bob, d1);
        vm.revertToState(snap);

        uint256 shares2 = _deposit(bob, d1 + delta);
        assertGe(shares2, shares1, "larger deposit must never mint fewer shares");
    }

    /// @dev First-deposit boundary fuzz: every amount ≤ 1000 base units reverts
    ///      AmountTooSmall; every amount ≥ 1001 succeeds with `amount - 1000` shares.
    function testFuzz_firstDepositBoundary_1000_1001(uint256 amount) public {
        amount = bound(amount, 1, 2000);
        _fund(alice, amount);

        if (amount <= DEAD_SHARES) {
            vm.prank(alice);
            vm.expectRevert(Vault.AmountTooSmall.selector);
            vault.deposit(amount);
            assertEq(vault.totalSupply(), 0, "failed bootstrap must change nothing");
        } else {
            uint256 shares = _deposit(alice, amount);
            assertEq(shares, amount - DEAD_SHARES);
            assertEq(vault.balanceOf(DEAD_ADDRESS), DEAD_SHARES);
            assertEq(vault.balanceOf(alice), amount - DEAD_SHARES);
            assertEq(vault.totalSupply(), amount);
        }
    }
}
