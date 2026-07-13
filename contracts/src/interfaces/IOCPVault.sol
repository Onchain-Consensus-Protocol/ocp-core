// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IOCPVault {
    enum Side {
        YES,
        NO,
        INVALID
    }
    enum Outcome {
        PENDING,
        YES,
        NO,
        INVALID
    }

    function protocolVersion() external pure returns (uint256);
    function stakeToken() external view returns (IERC20);
    function resolutionTime() external view returns (uint256);
    function minStake() external view returns (uint256);
    function totalPrincipal() external view returns (uint256);
    function totalDonations() external view returns (uint256);
    function totalStakeYes() external view returns (uint256);
    function totalStakeNo() external view returns (uint256);
    function totalStakeInvalid() external view returns (uint256);
    function stakeOf(address user) external view returns (uint256 yes, uint256 no, uint256 invalid);
    function sideOf(address user) external view returns (Side side, bool hasPosition);
    function resolved() external view returns (bool);
    function outcome() external view returns (Outcome);
    function canResolve() external view returns (bool);

    function stake(Side side, uint256 amount) external;
    function donate(uint256 amount) external;
    function finalize() external;
    function withdraw() external;
}
