// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {Test} from "forge-std/Test.sol";
import {Vault} from "../src/Vault.sol";
import {MaliciousToken} from "./mocks/MaliciousToken.sol";

/// @title ReentrancyTest — malicious ERC-20 re-entering deposit/withdraw is rejected
contract ReentrancyTest is Test {
    MaliciousToken internal evil;
    Vault internal vault;

    address internal alice = makeAddr("alice");
    address internal attacker = makeAddr("attacker");

    function setUp() public {
        evil = new MaliciousToken();
        vault = new Vault(address(evil));
        evil.setVault(address(vault));

        evil.mint(alice, 100_000e18);
        evil.mint(attacker, 100_000e18);

        vm.prank(alice);
        evil.approve(address(vault), type(uint256).max);
        vm.prank(attacker);
        evil.approve(address(vault), type(uint256).max);
    }

    /// @dev Establish legitimate state before each attack.
    function _bootstrap() internal returns (uint256 aliceShares) {
        vm.prank(alice);
        aliceShares = vault.deposit(10_000e18);
    }

    function test_reenterDeposit_revertsReentrancy_stateConsistent() public {
        _bootstrap();

        uint256 supplyBefore = vault.totalSupply();
        uint256 aliceBefore = vault.balanceOf(alice);
        uint256 vaultTokensBefore = evil.balanceOf(address(vault));

        evil.setAttack(MaliciousToken.Attack.ReenterDeposit, 0);

        vm.prank(attacker);
        vm.expectRevert(Vault.Reentrancy.selector);
        vault.deposit(5_000e18);

        // nested call was rejected and the whole attempt rolled back
        assertEq(vault.totalSupply(), supplyBefore, "supply changed after failed attack");
        assertEq(vault.balanceOf(alice), aliceBefore, "balances changed after failed attack");
        assertEq(vault.balanceOf(attacker), 0, "attacker must hold no shares");
        assertEq(evil.balanceOf(address(vault)), vaultTokensBefore, "vault token balance changed after failed attack");
    }

    function test_reenterWithdraw_revertsReentrancy_stateConsistent() public {
        uint256 aliceShares = _bootstrap();
        uint256 withdrawShares = 1_000e18;

        uint256 supplyBefore = vault.totalSupply();
        uint256 aliceBefore = vault.balanceOf(alice);
        uint256 vaultTokensBefore = evil.balanceOf(address(vault));
        uint256 aliceTokensBefore = evil.balanceOf(alice);

        evil.setAttack(MaliciousToken.Attack.ReenterWithdraw, withdrawShares);

        vm.prank(alice);
        vm.expectRevert(Vault.Reentrancy.selector);
        vault.withdraw(withdrawShares);

        // state identical to before the attempt
        assertEq(vault.totalSupply(), supplyBefore, "supply changed after failed attack");
        assertEq(vault.balanceOf(alice), aliceBefore, "share balance changed after failed attack");
        assertEq(vault.balanceOf(DEAD_ADDRESS()), 1000, "dead shares changed after attack");
        assertEq(evil.balanceOf(address(vault)), vaultTokensBefore, "vault token balance changed after failed attack");
        assertEq(evil.balanceOf(alice), aliceTokensBefore, "token balance changed after attack");
        assertEq(aliceBefore, aliceShares, "sanity: shares unchanged (withdraw reverted)");
    }

    function DEAD_ADDRESS() internal pure returns (address) {
        return address(0xdead);
    }
}
