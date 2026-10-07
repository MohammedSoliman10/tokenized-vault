// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {Test} from "forge-std/Test.sol";
import {FaucetToken} from "../../src/FaucetToken.sol";

/// @title FaucetTokenHandler — invariant handler: claim, warp
/// @notice Ghosts: `ghost_claimSum` (total minted by successful claims) and
///         `ghost_lastNextClaimAt[actor]` (latest observed nextClaimAt per actor).
contract FaucetTokenHandler is Test {
    FaucetToken public immutable token;

    address[] public actors;
    uint256 public ghost_claimSum;
    mapping(address => uint256) public ghost_lastNextClaimAt;

    constructor(FaucetToken token_, address[] memory actors_) {
        token = token_;
        actors = actors_;
    }

    function claim(uint256 actorSeed) external {
        address who = actors[actorSeed % actors.length];
        uint256 next = token.nextClaimAt(who);
        if (next != 0 && block.timestamp < next) return; // cooldown active — nothing to do

        vm.prank(who);
        token.faucet();

        ghost_claimSum += token.FAUCET_AMOUNT();
        ghost_lastNextClaimAt[who] = token.nextClaimAt(who);
    }

    function warp(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 1, 2 days));
    }
}
