// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Test} from "forge-std/Test.sol";
import {DLPMath} from "../src/DLPMath.sol";
contract DLPDepthNumericTest is Test {
 function testHighPrecisionReferencesAtMaximumDynamicDepth() public pure {
 uint256 b=1e30;uint256 guard=b/1e14+100;
 assertApproxEqAbs(DLPMath.cost(0,0,b),693147180559945309417232121458,guard/2);
 assertApproxEqAbs(DLPMath.cost(1000000000000,0,b),693147180559945309917232121458,guard/2);
 assertApproxEqAbs(DLPMath.cost(1000000000000000000,0,b),693147180560445309417232246458,guard/2);
 assertApproxEqAbs(DLPMath.cost(1000000000000000000000000,0,b),693147680560070309417232116249,guard/2);
 assertApproxEqAbs(DLPMath.cost(10000000000000000000000000000,0,b),698159680507862323303485863053,guard/2);
 assertApproxEqAbs(DLPMath.cost(500000000000000000000000000000,0,b),974076984180106680872997355081,guard/2);
 assertApproxEqAbs(DLPMath.cost(1000000000000000000000000000000,0,b),1313261687518222834048995494967,guard/2);
 }
 function testFuzzDynamicDepthDomain(uint128 rawB,uint128 rawY,uint128 rawN,uint128 rawDelta) public pure {
 uint256 b=bound(uint256(rawB),1e24,1e30);uint256 y=bound(uint256(rawY),0,b);uint256 n=bound(uint256(rawN),0,b);uint256 delta=bound(uint256(rawDelta),0,b-y);uint256 guard=b/1e14+100;
 uint256 beforeCost=DLPMath.cost(y,n,b);uint256 afterCost=DLPMath.cost(y+delta,n,b);
 assertGe(afterCost+guard,beforeCost);assertLe(afterCost,beforeCost+delta+guard);
 assertEq(DLPMath.priceYes(y,n,b)+DLPMath.priceYes(n,y,b),1e18);
 }
}
