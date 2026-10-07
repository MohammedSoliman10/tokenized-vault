// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {Test} from "forge-std/Test.sol";
import {FaucetToken} from "../src/FaucetToken.sol";
import {FaucetTokenHandler} from "./helpers/FaucetTokenHandler.sol";

/// @title FaucetTokenInvariantTest — Constitution II: supply/claim and cooldown invariants
contract FaucetTokenInvariantTest is Test {
    FaucetToken internal token;
    FaucetTokenHandler internal handler;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    function setUp() public {
        token = new FaucetToken();

        address[] memory actors = new address[](3);
        actors[0] = alice;
        actors[1] = bob;
        actors[2] = carol;
        handler = new FaucetTokenHandler(token, actors);

        bytes4[] memory selectors = new bytes4[](2);
        selectors[0] = FaucetTokenHandler.claim.selector;
        selectors[1] = FaucetTokenHandler.warp.selector;

        targetContract(address(handler));
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    /// (3) totalSupply grows by EXACTLY 1000e18 per successful claim — nothing else mints.
    function invariant_supplyGrowsExactly1000e18PerClaim() public view {
        assertEq(
            token.totalSupply(),
            handler.ghost_claimSum(),
            "totalSupply != 1000e18 * successful claims"
        );
    }

    /// (4) nextClaimAt(user) never decreases across any claim sequence.
    function invariant_nextClaimAtNeverDecreases() public view {
        for (uint256 i; i < 3; ++i) {
            address who = handler.actors(i);
            assertGe(
                token.nextClaimAt(who),
                handler.ghost_lastNextClaimAt(who),
                "nextClaimAt decreased"
            );
        }
    }
}
