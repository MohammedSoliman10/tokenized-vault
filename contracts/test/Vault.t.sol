// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {VaultTestBase} from "./VaultTestBase.sol";
import {Vault} from "../src/Vault.sol";

/// @dev Minimal ERC-20 whose transfer/transferFrom can be made to RETURN FALSE
///      (OZ tokens revert instead — the Vault guards on `false` returns).
contract FalseReturnToken {
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    bool public failTransfer;
    bool public failTransferFrom;

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function setFail(bool transfer_, bool transferFrom_) external {
        failTransfer = transfer_;
        failTransferFrom = transferFrom_;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address, uint256) external view returns (bool) {
        return !failTransfer;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (failTransferFrom) return false;
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract VaultTest is VaultTestBase {
    event Deposit(address indexed caller, uint256 amount, uint256 shares);
    event Withdraw(address indexed caller, uint256 shares, uint256 amount);

    // ─────────────────────── deposit happy path ───────────────────────

    function test_deposit_bootstrap_happyPath_andEvent() public {
        _fund(alice, 10_000e18);

        uint256 expectedShares = 10_000e18 - DEAD_SHARES;
        vm.expectEmit(true, false, false, true);
        emit Deposit(alice, 10_000e18, expectedShares);

        uint256 shares = _deposit(alice, 10_000e18);

        assertEq(shares, expectedShares);
        assertEq(vault.balanceOf(alice), expectedShares);
        assertEq(vault.balanceOf(DEAD_ADDRESS), DEAD_SHARES);
        assertEq(vault.totalSupply(), 10_000e18);
        assertEq(token.balanceOf(address(vault)), 10_000e18);
    }

    function test_deposit_secondDepositor_shareMath() public {
        _fund(alice, 10_000e18);
        _deposit(alice, 10_000e18); // bootstrap: totalSupply 10_000e18, balance 10_000e18

        _fund(bob, 5_000e18);
        uint256 shares = _deposit(bob, 5_000e18);
        // shares = amount * totalSupply / vaultBalance = 5_000e18 * 10_000e18 / 10_000e18
        assertEq(shares, 5_000e18);
        assertEq(vault.balanceOf(bob), 5_000e18);
        assertEq(vault.totalSupply(), 15_000e18);
        assertEq(token.balanceOf(address(vault)), 15_000e18);
    }

    // ─────────────────────── withdraw happy path ───────────────────────

    function test_withdraw_happyPath_andEvent() public {
        _fund(alice, 10_000e18);
        uint256 depositedShares = _deposit(alice, 10_000e18);

        uint256 withdrawShares = 4_000e18;
        uint256 expectedAmount = 4_000e18; // 4_000e18 * 10_000e18 / 10_000e18
        vm.expectEmit(true, false, false, true);
        emit Withdraw(alice, withdrawShares, expectedAmount);

        uint256 amount = _withdraw(alice, withdrawShares);

        assertEq(amount, expectedAmount);
        assertEq(token.balanceOf(alice), expectedAmount); // deposited 10_000e18, balance was 0
        assertEq(vault.balanceOf(alice), depositedShares - withdrawShares);
        assertEq(vault.totalSupply(), 10_000e18 - withdrawShares);
    }

    function test_fullRoundTrip_leavesDeadBacking() public {
        _fund(alice, 10_000e18);
        uint256 shares = _deposit(alice, 10_000e18);

        uint256 amount = _withdraw(alice, shares);

        // alice gets back her deposit minus the 1000 wei backing the dead shares
        assertEq(amount, 10_000e18 - DEAD_SHARES);
        assertEq(vault.balanceOf(alice), 0);
        assertEq(vault.totalSupply(), DEAD_SHARES);
        assertEq(token.balanceOf(address(vault)), DEAD_SHARES);
        assertEq(vault.balanceOf(DEAD_ADDRESS), DEAD_SHARES);
    }

    // ─────────────────────── bootstrap branch ───────────────────────

    function test_bootstrap_firstDeposit_1000_revertsAmountTooSmall() public {
        _fund(alice, 1000);
        vm.prank(alice);
        vm.expectRevert(Vault.AmountTooSmall.selector);
        vault.deposit(1000);
    }

    function test_bootstrap_firstDeposit_below1000_revertsAmountTooSmall() public {
        _fund(alice, 999);
        vm.prank(alice);
        vm.expectRevert(Vault.AmountTooSmall.selector);
        vault.deposit(999);
    }

    function test_bootstrap_firstDeposit_1001_succeeds_oneShareToCaller() public {
        _fund(alice, 1001);

        uint256 shares = _deposit(alice, 1001);

        assertEq(shares, 1); // 1001 - 1000 dead
        assertEq(vault.balanceOf(alice), 1);
        assertEq(vault.balanceOf(DEAD_ADDRESS), DEAD_SHARES);
        assertEq(vault.totalSupply(), 1001);
        assertEq(token.balanceOf(address(vault)), 1001);
    }

    // ─────────────────────── custom errors ───────────────────────

    function test_deposit_zero_revertsZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(Vault.ZeroAmount.selector);
        vault.deposit(0);
    }

    function test_withdraw_zero_revertsZeroShares() public {
        vm.prank(alice);
        vm.expectRevert(Vault.ZeroShares.selector);
        vault.withdraw(0);
    }

    function test_transferFromReturningFalse_revertsTransferFailed() public {
        FalseReturnToken fr = new FalseReturnToken();
        Vault v2 = new Vault(address(fr));
        fr.mint(alice, 10_000e18);
        fr.setFail(false, true); // transferFrom will return false

        vm.startPrank(alice);
        fr.approve(address(v2), type(uint256).max);
        vm.expectRevert(Vault.TransferFailed.selector);
        v2.deposit(5_000e18);
        vm.stopPrank();
    }

    function test_transferReturningFalse_revertsTransferFailed_onWithdraw() public {
        FalseReturnToken fr = new FalseReturnToken();
        Vault v2 = new Vault(address(fr));
        fr.mint(alice, 10_000e18);

        vm.startPrank(alice);
        fr.approve(address(v2), type(uint256).max);
        uint256 shares = v2.deposit(5_000e18);
        vm.stopPrank();

        fr.setFail(true, false);
        vm.prank(alice);
        vm.expectRevert(Vault.TransferFailed.selector);
        v2.withdraw(shares);
    }

    // ─────────────────────── shares non-transferable ───────────────────────

    function test_shares_haveNoTransferApproveSurface() public {
        (bool okTransfer,) =
            address(vault).call(abi.encodeWithSignature("transfer(address,uint256)", bob, 1));
        assertFalse(okTransfer, "Vault must not expose transfer() for shares");

        (bool okTransferFrom,) = address(vault).call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", alice, bob, 1)
        );
        assertFalse(okTransferFrom, "Vault must not expose transferFrom() for shares");

        (bool okApprove,) =
            address(vault).call(abi.encodeWithSignature("approve(address,uint256)", bob, 1));
        assertFalse(okApprove, "Vault must not expose approve() for shares");
    }
}
