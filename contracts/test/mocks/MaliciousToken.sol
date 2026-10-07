// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Vault} from "../../src/Vault.sol";

/// @title MaliciousToken — ERC-20 whose transfer/transferFrom re-enters the Vault
/// @notice Used to prove the Vault's `nonReentrant` guard: the nested call reverts
///         `Reentrancy()` and the outer call's state stays consistent (fully rolled back).
contract MaliciousToken is ERC20 {
    enum Attack {
        None,
        ReenterDeposit,
        ReenterWithdraw
    }

    Vault public vault;
    Attack public attack;
    uint256 public attackShares;

    constructor() ERC20("Malicious Token", "EVIL") {}

    function setVault(address vault_) external {
        vault = Vault(vault_);
    }

    function setAttack(Attack attack_, uint256 shares_) external {
        attack = attack_;
        attackShares = shares_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        _transfer(msg.sender, to, value);
        _attack(); // called while the Vault is mid-withdraw
        return true;
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        _spendAllowance(from, msg.sender, value);
        _transfer(from, to, value);
        _attack(); // called while the Vault is mid-deposit
        return true;
    }

    function _attack() internal {
        if (attack == Attack.ReenterDeposit) {
            vault.deposit(1e18); // reverts Reentrancy() — bubbles up through this call
        } else if (attack == Attack.ReenterWithdraw) {
            vault.withdraw(attackShares); // reverts Reentrancy() — bubbles up
        }
    }
}
