// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;
import {IOCPCore} from "./IOCPCore.sol";

/// @notice Proposal lifecycle only. Tokens, vote weights and final outcomes remain in Core.
interface IEarlyTerminationModule {
    function initialize(address core_, uint256 bondAmount_) external;
    function core() external view returns (address);
    function bondAmount() external view returns (uint256);
    function bondRequired() external view returns (uint256);
    function proposalCount() external view returns (uint256);
    function pending() external view returns (IOCPCore.EarlyTerminationRequest memory);
    function propose(address proposer, uint8 requestedOutcome, bytes32 reasonHash)
        external returns (IOCPCore.EarlyTerminationRequest memory);
    function consume() external returns (IOCPCore.EarlyTerminationRequest memory);
}
