// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../src/factory/OCPVaultFactory.sol";

/**
 * @notice Base Sepolia 专用的 10 小时端到端测试市场。
 * @dev 测试代币、V5 Factory、Vault 与 LMSR Market 在同一次广播中创建。
 *      chain id 硬校验用于防止私钥误连 Base 主网或其他网络。
 */
contract BaseSepoliaTestUSDC is ERC20 {
    constructor() ERC20("Base Sepolia Test USDC", "tUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract DeployBaseSepoliaDemoScript is Script {
    uint256 private constant BASE_SEPOLIA_CHAIN_ID = 84_532;
    uint256 private constant MIN_STAKE = 1e6;
    uint256 private constant LIQUIDITY_PARAMETER = 1_000e6;
    uint256 private constant EXPECTED_SUBSIDY = 693_147_183;

    function run()
        external
        returns (BaseSepoliaTestUSDC token, OCPVaultFactory factory, address vault, address market)
    {
        require(block.chainid == BASE_SEPOLIA_CHAIN_ID, "Base Sepolia only");

        string memory privateKeyString = vm.envString("PRIVATE_KEY");
        uint256 deployerPrivateKey;
        if (
            bytes(privateKeyString).length >= 2 && bytes(privateKeyString)[0] == "0"
                && bytes(privateKeyString)[1] == "x"
        ) {
            deployerPrivateKey = vm.parseUint(privateKeyString);
        } else {
            deployerPrivateKey = vm.parseUint(string(abi.encodePacked("0x", privateKeyString)));
        }
        require(deployerPrivateKey != 0, "Invalid PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        token = new BaseSepoliaTestUSDC();
        token.mint(deployer, 1_000_000e6);

        factory = new OCPVaultFactory(address(token), deployer);
        token.approve(address(factory), EXPECTED_SUBSIDY);

        (vault, market) = factory.createMarket(
            address(token),
            block.timestamp + 10 hours,
            MIN_STAKE,
            LIQUIDITY_PARAMETER,
            "OCP 10-Hour Test Market",
            "YES: test succeeds. NO: test fails. INVALID: the result cannot be verified."
        );

        require(token.allowance(deployer, address(factory)) == 0, "Unexpected allowance");
        require(
            PredictionMarket(market).requiredSubsidy() == EXPECTED_SUBSIDY, "Unexpected subsidy"
        );

        vm.stopBroadcast();

        console.log("Base Sepolia Test USDC:", address(token));
        console.log("OCPVaultFactory:", address(factory));
        console.log("OCPVault:", vault);
        console.log("PredictionMarket:", market);
        console.log("Resolution time:", OCPVault(vault).resolutionTime());
    }
}
