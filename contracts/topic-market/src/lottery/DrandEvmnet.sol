// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BLS} from "./vendor/BLS.sol";

/// @dev League of Entropy evmnet. The key and domain match the upstream EvmnetRegistry.
library DrandEvmnet {
    uint64 internal constant GENESIS = 1727521075;
    uint64 internal constant PERIOD = 3;
    string private constant DST = "BLS_SIG_BN254G1_XMD:KECCAK-256_SVDW_RO_NUL_";

    function roundAtOrAfter(uint64 timestamp) internal pure returns (uint64) {
        return ((timestamp - GENESIS + PERIOD - 1) / PERIOD) + 1;
    }

    function publicationTime(uint64 round) internal pure returns (uint64) {
        return GENESIS + (round - 1) * PERIOD;
    }

    function verify(bytes calldata signature, uint64 round) internal view returns (bool) {
        if (signature.length != 64) return false;
        BLS.PointG1 memory point = BLS.g1Unmarshal(signature);
        if (point.x == 0 && point.y == 0) return false;

        BLS.PointG2 memory publicKey = BLS.PointG2(
            [
                0x557ec32c2ad488e4d4f6008f89a346f18492092ccc0d594610de2732c8b808f,
                0x7e1d1d335df83fa98462005690372c643340060d205306a9aa8106b6bd0b382
            ],
            [
                0x297d3a4f9749b33eb2d904c9d9ebf17224150ddd7abd7567a9bec6c74480ee0b,
                0x95685ae3a85ba243747b1b2f426049010f6b73a0cf1d389351d5aaaa1047f6
            ]
        );
        bytes memory message = abi.encodePacked(keccak256(abi.encodePacked(round)));
        (bool valid, bool success) = BLS.verifySingle(point, publicKey, BLS.hashToPoint(bytes(DST), message));
        return valid && success;
    }
}
