// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/factory/OCPVaultFactory.sol";

/**
 *  @notice 只部署 Factory，不创建代币、市场或 Vault。
 */
contract DeployVaultFactoryScript is Script {
    address private constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    function run() external returns (OCPVaultFactory factory) {
        string memory privateKeyString = vm.envString("PRIVATE_KEY");
        uint256 deployerPrivateKey;
        bytes memory privateKeyBytes = bytes(privateKeyString);
        if (
            privateKeyBytes.length >= 2 && privateKeyBytes[0] == "0"
                && privateKeyBytes[1] == "x"
        ) {
            deployerPrivateKey = vm.parseUint(privateKeyString);
        } else {
            deployerPrivateKey =
                vm.parseUint(string(abi.encodePacked("0x", privateKeyString)));
        }
        uint256 expectedChainId = vm.envUint("EXPECTED_CHAIN_ID");
        address stakeToken = vm.envAddress("STAKE_TOKEN");
        address officialLiquidityPool = vm.envAddress("OFFICIAL_LIQUIDITY_POOL");
        require(deployerPrivateKey != 0, "Invalid PRIVATE_KEY");
        require(block.chainid == expectedChainId, "Unexpected chain");
        require(stakeToken != address(0), "Invalid STAKE_TOKEN");
        require(officialLiquidityPool != address(0), "Invalid OFFICIAL_LIQUIDITY_POOL");
        require(stakeToken.code.length > 0, "STAKE_TOKEN has no code");
        if (block.chainid == 8453) require(stakeToken == BASE_USDC, "Base requires native USDC");
        vm.startBroadcast(deployerPrivateKey);
        factory = new OCPVaultFactory(stakeToken, officialLiquidityPool);
        vm.stopBroadcast();
        console.log("OCPVaultFactory:", address(factory));
        console.log("Official stake token:", stakeToken);
        console.log("Official liquidity pool:", officialLiquidityPool);
        console.log("Vaults created: 0");
    }
}
