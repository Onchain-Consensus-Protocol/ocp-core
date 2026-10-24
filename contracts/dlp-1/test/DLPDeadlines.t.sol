// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {DLPBase, MockCore} from "./DLPBase.sol";
import {DLPMarket} from "../src/DLPMarket.sol";

contract DLPDeadlinesTest is DLPBase {
    function _deploy(uint64 core) internal returns (DLPMarket) {
        return new DLPMarket(usd, oracle, creator, protocol, core, 1e6, 1e18);
    }
    function testSingleFinalDeadlineDerivesAllCutoffs() public view {
        assertEq(market.genesisCutoff(), block.timestamp + 3 hours);
        assertEq(market.formalCutoff(), block.timestamp + 5 hours);
        assertEq(market.coreCutoff(), block.timestamp + 6 hours);
        assertEq(market.topicCutoff(), market.coreCutoff());
    }
    function testRejectCoreAtOrBeforeCreationPlusFourHours() public {
        vm.expectRevert("DEADLINES"); _deploy(uint64(block.timestamp+4 hours));
        vm.expectRevert("DEADLINES"); _deploy(uint64(block.timestamp+4 hours-1));
        vm.expectRevert("DEADLINES"); _deploy(uint64(block.timestamp));
    }
    function testMinimumValidFinalDeadlineLeavesOneSecondFormalWindow() public {
        DLPMarket m=_deploy(uint64(block.timestamp+4 hours+1));
        assertEq(m.formalCutoff(),m.genesisCutoff()+1);
        assertEq(m.coreCutoff(),m.formalCutoff()+1 hours);
        assertEq(m.topicCutoff(),m.coreCutoff());
    }
    function testLastSecondGraduationOpensBothUntilIndependentCutoffs() public {
        vm.warp(market.genesisCutoff()-1); _graduate();
        assertEq(oracle.openedAt(),block.timestamp);
        _formalBuy(bob,true,1e18);
        vm.warp(market.formalCutoff()-1); _formalBuy(bob,true,1e18);
        vm.warp(market.formalCutoff());
        vm.prank(bob);vm.expectRevert("FORMAL_CLOSED");market.formalBuy(true,1e18,type(uint256).max,type(uint64).max);
        assertEq(market.coreCutoff(),block.timestamp+1 hours);
    }
    function testExactlyGenesisCannotGraduateAndSkippedTimeFails() public {
        vm.warp(market.genesisCutoff());
        vm.prank(alice);vm.expectRevert("GENESIS_CLOSED");market.genesisBuy(14e6,0,type(uint64).max,0);
        vm.warp(market.topicCutoff()+1);market.closeExpired();
        assertEq(uint256(market.phase()),uint256(DLPMarket.Phase.FAILED));assertEq(oracle.openedAt(),0);
    }
    function testSkippingFormalCloseStillAllowsCoreFinalization() public {
        _graduate();vm.warp(market.topicCutoff()+1);oracle.resolve(1);market.finalize();
        assertEq(uint256(market.phase()),uint256(DLPMarket.Phase.SETTLED));
    }
    function testUint64GenesisOverflowRejectedAndMaximumCoreAcceptedWithoutWrap() public {
        vm.warp(uint256(type(uint64).max)-3 hours+1);
        vm.expectRevert(bytes("TIME"));_deploy(type(uint64).max);
        vm.warp(100000);
        DLPMarket m=_deploy(type(uint64).max);
        assertEq(m.coreCutoff(),type(uint64).max);
        assertEq(m.formalCutoff(),uint256(type(uint64).max)-1 hours);
    }
}
