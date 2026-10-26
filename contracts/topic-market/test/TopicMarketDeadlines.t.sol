// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {TopicMarketBase, MockCore} from "./TopicMarketBase.sol";
import {TopicMarket} from "../src/TopicMarket.sol";

contract TopicMarketDeadlinesTest is TopicMarketBase {
    function _deploy(uint64 core) internal returns (TopicMarket) {
        return new TopicMarket(usd, oracle, creator, protocol, core, 1e6, 1e18);
    }
    function testSingleFinalDeadlineDerivesAllCutoffs() public view {
        assertEq(market.genesisCutoff(), block.timestamp + 4 hours);
        assertEq(market.formalCutoff(), block.timestamp + 5 hours);
        assertEq(market.coreCutoff(), block.timestamp + 6 hours);
        assertEq(market.topicCutoff(), market.coreCutoff());
    }
    function testLongerTopicDerivesGenesisFromFinalDeadline() public {
        TopicMarket m=_deploy(uint64(block.timestamp+12 hours));
        assertEq(m.genesisCutoff(),block.timestamp+10 hours);
        assertEq(m.formalCutoff(),m.genesisCutoff()+1 hours);
        assertEq(m.coreCutoff(),m.formalCutoff()+1 hours);
    }
    function testGenesisTradesAfterOldThreeHourLimit() public {
        vm.warp(block.timestamp+3 hours+1);
        _buy(alice,1e6);
        uint256 half=market.shares(alice)/2;
        vm.prank(alice);market.genesisSell(half,0,type(uint64).max,0);
        assertEq(uint256(market.phase()),uint256(TopicMarket.Phase.GENESIS));
        vm.expectRevert("EARLY");market.closeExpired();
    }
    function testRejectCoreAtOrBeforeCreationPlusFourHours() public {
        vm.expectRevert("DEADLINES"); _deploy(uint64(block.timestamp+4 hours));
        vm.expectRevert("DEADLINES"); _deploy(uint64(block.timestamp+4 hours-1));
        vm.expectRevert("DEADLINES"); _deploy(uint64(block.timestamp));
    }
    function testMinimumValidFinalDeadlineKeepsOneHourBetweenCutoffs() public {
        TopicMarket m=_deploy(uint64(block.timestamp+4 hours+1));
        assertEq(m.formalCutoff(),m.genesisCutoff()+1 hours);
        assertEq(m.coreCutoff(),m.formalCutoff()+1 hours);
        assertEq(m.topicCutoff(),m.coreCutoff());
    }
    function testLastSecondGraduationOpensBothUntilIndependentCutoffs() public {
        vm.warp(market.genesisCutoff()-1); _graduate();
        assertEq(market.formalCutoff(),market.genesisCutoff()+1 hours);
        assertEq(oracle.openedAt(),block.timestamp);
        _formalBuy(bob,true,1e18);
        vm.warp(market.formalCutoff()-1); _formalBuy(bob,true,1e18);
        vm.warp(market.formalCutoff());
        vm.prank(bob);vm.expectRevert("FORMAL_CLOSED");market.formalBuy(true,1e18,type(uint256).max,type(uint64).max);
        assertEq(market.coreCutoff(),market.formalCutoff()+1 hours);
    }
    function testExactlyGenesisCannotGraduateAndSkippedTimeFails() public {
        vm.warp(market.genesisCutoff());
        vm.prank(alice);vm.expectRevert("GENESIS_CLOSED");market.genesisSell(1,0,type(uint64).max,0);
        vm.prank(alice);vm.expectRevert("GENESIS_CLOSED");market.genesisBuy(14e6,0,type(uint64).max,0);
        vm.warp(market.topicCutoff()+1);market.closeExpired();
        assertEq(uint256(market.phase()),uint256(TopicMarket.Phase.FAILED));assertEq(oracle.openedAt(),0);
    }
    function testSkippingFormalCloseStillAllowsCoreFinalization() public {
        _graduate();vm.warp(market.topicCutoff()+1);oracle.resolve(1);market.finalize();
        assertEq(uint256(market.phase()),uint256(TopicMarket.Phase.SETTLED));
    }
    function testUint64TimeOverflowRejectedAndMaximumCoreAcceptedWithoutWrap() public {
        vm.warp(uint256(type(uint64).max)-4 hours+1);
        vm.expectRevert(bytes("TIME"));_deploy(type(uint64).max);
        vm.warp(100000);
        TopicMarket m=_deploy(type(uint64).max);
        assertEq(m.coreCutoff(),type(uint64).max);
        assertEq(m.genesisCutoff(),uint256(type(uint64).max)-2 hours);
        assertEq(m.formalCutoff(),uint256(type(uint64).max)-1 hours);
    }
}
