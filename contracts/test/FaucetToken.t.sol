// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {Test} from "forge-std/Test.sol";
import {FaucetToken} from "../src/FaucetToken.sol";

contract FaucetTokenTest is Test {
    FaucetToken internal token;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 internal constant AMOUNT = 1000e18;
    uint256 internal constant COOLDOWN = 24 hours;

    event Claimed(address indexed caller, uint256 amount);

    function setUp() public {
        token = new FaucetToken();
    }

    // ─────────────────────────── unit ───────────────────────────

    function test_metadata() public view {
        assertEq(token.name(), "Vault Test Token");
        assertEq(token.symbol(), "VTT");
        assertEq(token.decimals(), 18);
        assertEq(token.FAUCET_AMOUNT(), AMOUNT);
        assertEq(token.COOLDOWN(), COOLDOWN);
    }

    function test_firstClaim_mintsExactly1000e18_andEmitsClaimed() public {
        vm.warp(1_000_000);
        vm.expectEmit(true, false, false, true);
        emit Claimed(alice, AMOUNT);

        vm.prank(alice);
        token.faucet();

        assertEq(token.balanceOf(alice), AMOUNT);
        assertEq(token.totalSupply(), AMOUNT);
        assertEq(token.nextClaimAt(alice), 1_000_000 + COOLDOWN);
    }

    function test_nextClaimAt_isZeroBeforeFirstClaim() public view {
        assertEq(token.nextClaimAt(alice), 0);
    }

    function test_secondClaim_within24h_revertsCooldownActive() public {
        vm.warp(1_000_000);
        vm.prank(alice);
        token.faucet();

        uint256 availableAt = 1_000_000 + COOLDOWN;
        assertEq(token.nextClaimAt(alice), availableAt);

        vm.warp(availableAt - 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FaucetToken.CooldownActive.selector, availableAt));
        token.faucet();

        // state unchanged by the failed claim
        assertEq(token.balanceOf(alice), AMOUNT);
        assertEq(token.totalSupply(), AMOUNT);
    }

    function test_boundary_86399_fails_86400_succeeds() public {
        vm.warp(1_000_000);
        vm.prank(alice);
        token.faucet();

        vm.warp(1_000_000 + 86_399);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(FaucetToken.CooldownActive.selector, 1_000_000 + 86_400)
        );
        token.faucet();

        vm.warp(1_000_000 + 86_400);
        vm.prank(alice);
        token.faucet();
        assertEq(token.balanceOf(alice), 2 * AMOUNT);
        assertEq(token.nextClaimAt(alice), 1_000_000 + 86_400 + COOLDOWN);
    }

    function test_erc20_transfer_approve_allowance() public {
        vm.prank(alice);
        token.faucet();

        vm.prank(alice);
        token.transfer(bob, 100e18);
        assertEq(token.balanceOf(bob), 100e18);
        assertEq(token.balanceOf(alice), AMOUNT - 100e18);

        vm.prank(alice);
        token.approve(bob, 50e18);
        assertEq(token.allowance(alice, bob), 50e18);

        vm.prank(bob);
        token.transferFrom(alice, bob, 50e18);
        assertEq(token.allowance(alice, bob), 0);
        assertEq(token.balanceOf(bob), 150e18);
    }

    // ─────────────────────────── fuzz ───────────────────────────

    /// @dev Constitution II — claim amount is ALWAYS exactly 1000e18 for any timestamp/address.
    function testFuzz_claimAmountAlwaysExactly1000e18(uint256 ts, address who) public {
        vm.assume(who != address(0));
        ts = bound(ts, 1, type(uint64).max);

        vm.warp(ts);
        vm.prank(who);
        token.faucet();

        assertEq(token.balanceOf(who), AMOUNT, "claim amount must be exactly 1000e18");
        assertEq(token.nextClaimAt(who), ts + COOLDOWN);
    }

    /// @dev Constitution II — a second claim reverts CooldownActive(availableAt) for every
    ///      timestamp strictly before lastClaim + 24h, and succeeds at/after it,
    ///      across fuzzed timestamps and addresses.
    function testFuzz_secondClaim_revertsBeforeCooldown_andSucceedsAtIt(
        uint256 firstTs,
        uint256 offset,
        address who
    ) public {
        vm.assume(who != address(0));
        firstTs = bound(firstTs, 1, type(uint64).max);
        // offset ∈ [0, 2 days]; probe = firstTs + offset spans one day before..one day after
        // the cooldown boundary at firstTs + 1 day.
        offset = bound(offset, 0, 2 days);
        uint256 availableAt = firstTs + COOLDOWN;
        uint256 probe = firstTs + offset;

        // first claim always succeeds (never-claimed accounts bypass the cooldown)
        vm.warp(firstTs);
        vm.prank(who);
        token.faucet();
        assertEq(token.balanceOf(who), AMOUNT);

        vm.warp(probe);
        if (probe < availableAt) {
            vm.prank(who);
            vm.expectRevert(
                abi.encodeWithSelector(FaucetToken.CooldownActive.selector, availableAt)
            );
            token.faucet();
            // failed claim changed nothing
            assertEq(token.balanceOf(who), AMOUNT);
            assertEq(token.nextClaimAt(who), availableAt);
        } else {
            vm.prank(who);
            token.faucet();
            assertEq(token.balanceOf(who), 2 * AMOUNT, "claim must succeed at/after cooldown");
            assertEq(token.nextClaimAt(who), probe + COOLDOWN);
        }
    }

    /// @dev Independence: one address's claim never affects another address's cooldown.
    function testFuzz_perAddressCooldownIsIndependent(address a, address b) public {
        vm.assume(a != address(0) && b != address(0) && a != b);
        vm.warp(5_000_000);

        vm.prank(a);
        token.faucet();

        vm.prank(b);
        token.faucet();

        assertEq(token.balanceOf(a), AMOUNT);
        assertEq(token.balanceOf(b), AMOUNT);
        assertEq(token.nextClaimAt(a), 5_000_000 + COOLDOWN);
        assertEq(token.nextClaimAt(b), 5_000_000 + COOLDOWN);
    }
}
