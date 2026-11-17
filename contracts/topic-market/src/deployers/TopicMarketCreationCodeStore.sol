// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Inert runtime starts with STOP, followed by immutable creation-code bytes.
contract TopicMarketCreationCodeStore {
    constructor(bytes memory payload) {
        bytes memory runtime=abi.encodePacked(bytes1(0),payload);
        assembly { return(add(runtime,32),mload(runtime)) }
    }
}
