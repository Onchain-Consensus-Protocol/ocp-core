// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../market/PredictionMarket.sol";

/**
 * @notice 将 LMSR Market 的 creation bytecode 从官方 Factory runtime 中拆出。
 * @dev Market 的 factory 权限显式赋给调用本部署器的 OCPVaultFactory，而不是本部署器。
 */
contract PredictionMarketDeployer {
    function deploy(
        address vault,
        address officialLiquidityPool,
        uint8 conditionType,
        bytes calldata conditionParams,
        uint256 liquidityParameter
    ) external returns (address market) {
        market = address(
            new PredictionMarket(
                msg.sender,
                vault,
                officialLiquidityPool,
                conditionType,
                conditionParams,
                liquidityParameter
            )
        );
    }
}
