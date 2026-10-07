// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title FaucetToken — "Vault Test Token" (VTT)
/// @notice Public, permissionless faucet: mints exactly `FAUCET_AMOUNT` (1000e18) to the
///         caller at most once per `COOLDOWN` (24 hours) per address. No owner.
contract FaucetToken is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 1000e18;
    uint256 public constant COOLDOWN = 24 hours;

    mapping(address => uint256) private lastClaimAt;

    error CooldownActive(uint256 availableAt);

    event Claimed(address indexed caller, uint256 amount);

    constructor() ERC20("Vault Test Token", "VTT") {}

    /// @notice Mint `FAUCET_AMOUNT` to the caller if the cooldown has elapsed.
    /// @dev Reverts `CooldownActive(availableAt)` where `availableAt = lastClaim + COOLDOWN`.
    function faucet() external {
        uint256 last = lastClaimAt[msg.sender];
        if (last != 0 && block.timestamp < last + COOLDOWN) {
            revert CooldownActive(last + COOLDOWN);
        }
        lastClaimAt[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
        emit Claimed(msg.sender, FAUCET_AMOUNT);
    }

    /// @notice Timestamp at which `account` may claim again; 0 when never claimed (claimable now).
    function nextClaimAt(address account) external view returns (uint256) {
        uint256 last = lastClaimAt[account];
        return last == 0 ? 0 : last + COOLDOWN;
    }
}
