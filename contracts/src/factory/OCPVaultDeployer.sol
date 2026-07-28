// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../core/OCPVault.sol";

/**
 * @notice 将 Vault 的 creation bytecode 从官方 Factory runtime 中拆出。
 * @dev 任何人都能调用本部署器创建独立 Vault，但 Vault 会把调用者记录为 factory；
 *      只有 OCPVaultFactory 登记的 canonical pair 才属于官方市场。
 */
contract OCPVaultDeployer {
    function deploy(
        address stakeToken,
        uint256 resolutionTime,
        uint256 minStake,
        address emptySettlementRecipient
    ) external returns (address vault) {
        vault = address(
            new OCPVault(
                msg.sender,
                stakeToken,
                resolutionTime,
                minStake,
                emptySettlementRecipient
            )
        );
    }
}
