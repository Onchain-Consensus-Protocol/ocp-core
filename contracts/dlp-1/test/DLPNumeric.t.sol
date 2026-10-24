// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Test} from "forge-std/Test.sol";
import {DLPMath} from "../src/DLPMath.sol";

contract DLPNumericTest is Test {
    function testHighPrecisionReferenceGrid() public {
        uint256 maxError;
        {
            uint256 v = DLPMath.cost(0, 0, 1000000000000);
            uint256 e = v > 693147180559 ? v - 693147180559 : 693147180559 - v;
            assertLe(e, 100);
            if (e > maxError) maxError = e;
        }
        {
            uint256 v = DLPMath.cost(1000000000, 0, 1000000000000);
            uint256 e = v > 693647305559 ? v - 693647305559 : 693647305559 - v;
            assertLe(e, 100);
            if (e > maxError) maxError = e;
        }
        {
            uint256 v = DLPMath.cost(100000000000, 0, 1000000000000);
            uint256 e = v > 744396660073 ? v - 744396660073 : 744396660073 - v;
            assertLe(e, 100);
            if (e > maxError) maxError = e;
        }
        {
            uint256 v = DLPMath.cost(1000000000000, 0, 1000000000000);
            uint256 e = v > 1313261687518 ? v - 1313261687518 : 1313261687518 - v;
            assertLe(e, 100);
            if (e > maxError) maxError = e;
        }
        {
            uint256 v = DLPMath.cost(10000000000000, 0, 1000000000000);
            uint256 e = v > 10000045398899 ? v - 10000045398899 : 10000045398899 - v;
            assertLe(e, 100);
            if (e > maxError) maxError = e;
        }
        {
            uint256 v = DLPMath.cost(60000000000000, 0, 1000000000000);
            uint256 e = v > 60000000000000 ? v - 60000000000000 : 60000000000000 - v;
            assertLe(e, 100);
            if (e > maxError) maxError = e;
        }
        {
            uint256 v = DLPMath.cost(0, 0, 500000000000000000);
            uint256 e = v > 346573590279972654 ? v - 346573590279972654 : 346573590279972654 - v;
            assertLe(e, 5100);
            if (e > maxError) maxError = e;
        }
        {
            uint256 v = DLPMath.cost(500000000000000, 0, 500000000000000000);
            uint256 e = v > 346823652779970050 ? v - 346823652779970050 : 346823652779970050 - v;
            assertLe(e, 5100);
            if (e > maxError) maxError = e;
        }
        {
            uint256 v = DLPMath.cost(50000000000000000, 0, 500000000000000000);
            uint256 e = v > 372198330036785447 ? v - 372198330036785447 : 372198330036785447 - v;
            assertLe(e, 5100);
            if (e > maxError) maxError = e;
        }
        {
            uint256 v = DLPMath.cost(500000000000000000, 0, 500000000000000000);
            uint256 e = v > 656630843759111417 ? v - 656630843759111417 : 656630843759111417 - v;
            assertLe(e, 5100);
            if (e > maxError) maxError = e;
        }
        {
            uint256 v = DLPMath.cost(5000000000000000000, 0, 500000000000000000);
            uint256 e = v > 5000022699449608432 ? v - 5000022699449608432 : 5000022699449608432 - v;
            assertLe(e, 5100);
            if (e > maxError) maxError = e;
        }
        {
            uint256 v = DLPMath.cost(30000000000000000000, 0, 500000000000000000);
            uint256 e = v > 30000000000000000000 ? v - 30000000000000000000 : 30000000000000000000 - v;
            assertLe(e, 5100);
            if (e > maxError) maxError = e;
        }
        {
            uint256 v = DLPMath.cost(0, 0, 150000000000000000000);
            uint256 e = v > 103972077083991796412 ? v - 103972077083991796412 : 103972077083991796412 - v;
            assertLe(e, 1500100);
            if (e > maxError) maxError = e;
        }
        {
            uint256 v = DLPMath.cost(150000000000000000, 0, 150000000000000000000);
            uint256 e = v > 104047095833991015162 ? v - 104047095833991015162 : 104047095833991015162 - v;
            assertLe(e, 1500100);
            if (e > maxError) maxError = e;
        }
        {
            uint256 v = DLPMath.cost(15000000000000000000, 0, 150000000000000000000);
            uint256 e = v > 111659499011035634224 ? v - 111659499011035634224 : 111659499011035634224 - v;
            assertLe(e, 1500100);
            if (e > maxError) maxError = e;
        }
        {
            uint256 v = DLPMath.cost(150000000000000000000, 0, 150000000000000000000);
            uint256 e = v > 196989253127733425107 ? v - 196989253127733425107 : 196989253127733425107 - v;
            assertLe(e, 1500100);
            if (e > maxError) maxError = e;
        }
        {
            uint256 v = DLPMath.cost(1500000000000000000000, 0, 150000000000000000000);
            uint256 e = v > 1500006809834882529697 ? v - 1500006809834882529697 : 1500006809834882529697 - v;
            assertLe(e, 1500100);
            if (e > maxError) maxError = e;
        }
        {
            uint256 v = DLPMath.cost(9000000000000000000000, 0, 150000000000000000000);
            uint256 e = v > 9000000000000000000000 ? v - 9000000000000000000000 : 9000000000000000000000 - v;
            assertLe(e, 1500100);
            if (e > maxError) maxError = e;
        }
        {
            uint256 v = DLPMath.cost(0, 0, 1000000000000000000000000);
            uint256 e = v > 693147180559945309417232 ? v - 693147180559945309417232 : 693147180559945309417232 - v;
            assertLe(e, 10000000100);
            if (e > maxError) maxError = e;
        }
        {
            uint256 v = DLPMath.cost(1000000000000000000000, 0, 1000000000000000000000000);
            uint256 e = v > 693647305559940101084246 ? v - 693647305559940101084246 : 693647305559940101084246 - v;
            assertLe(e, 10000000100);
            if (e > maxError) maxError = e;
        }
        {
            uint256 v = DLPMath.cost(100000000000000000000000, 0, 1000000000000000000000000);
            uint256 e = v > 744396660073570894830099 ? v - 744396660073570894830099 : 744396660073570894830099 - v;
            assertLe(e, 10000000100);
            if (e > maxError) maxError = e;
        }
        {
            uint256 v = DLPMath.cost(1000000000000000000000000, 0, 1000000000000000000000000);
            uint256 e = v > 1313261687518222834048995 ? v - 1313261687518222834048995 : 1313261687518222834048995 - v;
            assertLe(e, 10000000100);
            if (e > maxError) maxError = e;
        }
        {
            uint256 v = DLPMath.cost(10000000000000000000000000, 0, 1000000000000000000000000);
            uint256 e = v > 10000045398899216864646769 ? v - 10000045398899216864646769 : 10000045398899216864646769 - v;
            assertLe(e, 10000000100);
            if (e > maxError) maxError = e;
        }
        {
            uint256 v = DLPMath.cost(60000000000000000000000000, 0, 1000000000000000000000000);
            uint256 e = v > 60000000000000000000000000 ? v - 60000000000000000000000000 : 60000000000000000000000000 - v;
            assertLe(e, 10000000100);
            if (e > maxError) maxError = e;
        }
        emit log_named_uint("Maximum absolute WAD cost error (24 samples)", maxError);
        assertLt(maxError, 1e12);
    }
}
