// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {TopicMarketDeployer} from "../src/TopicMarketFactory.sol";
import {TopicMarket} from "../src/TopicMarket.sol";

/// @notice Independent byte-for-byte check of the constructor's word-copy code stores.
contract TopicMarketCodeStoreReadbackTest is Test {
    function testCreationCodeReadbackExactLengthStopAndHash() public {
        TopicMarketDeployer deployer = new TopicMarketDeployer(address(0xFA));
        bytes memory expected = type(TopicMarket).creationCode;
        uint256 first = expected.length > 24000 ? 24000 : expected.length;
        uint256 second = expected.length - first;
        assertEq(deployer.lengthA(), first, "first payload length");
        assertEq(deployer.lengthB(), second, "second payload length");
        address a = deployer.codeA();
        address b = deployer.codeB();
        bytes memory runtimeA = a.code;
        bytes memory runtimeB = b.code;
        assertEq(runtimeA.length, first + 1, "no padding in first runtime");
        assertEq(runtimeB.length, second + 1, "no padding in second runtime");
        assertEq(uint256(uint8(runtimeA[0])), 0, "first STOP");
        assertEq(uint256(uint8(runtimeB[0])), 0, "second STOP");
        assertLe(runtimeA.length, 24576, "first runtime size");
        assertLe(runtimeB.length, 24576, "second runtime size");

        bytes memory recovered = new bytes(first + second);
        assembly {
            extcodecopy(a, add(recovered, 32), 1, first)
            extcodecopy(b, add(add(recovered, 32), first), 1, second)
        }
        assertEq(recovered.length, expected.length, "recovered length");
        assertEq(keccak256(recovered), keccak256(expected), "creation code exact hash");
        // Exercise the split boundary and the final non-word-aligned tail explicitly.
        if (first > 0) assertEq(uint256(uint8(recovered[first - 1])), uint256(uint8(expected[first - 1])));
        if (second > 0) assertEq(uint256(uint8(recovered[first])), uint256(uint8(expected[first])));
        assertEq(uint256(uint8(recovered[expected.length - 1])), uint256(uint8(expected[expected.length - 1])));
    }
}
