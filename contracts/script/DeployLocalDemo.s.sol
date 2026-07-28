// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../src/factory/OCPVaultFactory.sol";

/**
 * @notice 仅用于本地 Anvil 演示，不能用于正式网络部署。
 */
contract LocalDemoUSDC is ERC20 {
    constructor() ERC20("Local Demo USDC", "dUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract DeployLocalDemoScript is Script {
    function run()
        external
        returns (LocalDemoUSDC token, OCPVaultFactory factory, address vault, address market)
    {
        vm.startBroadcast();

        address operator = msg.sender;
        token = new LocalDemoUSDC();
        token.mint(operator, 1_000_000e6);

        factory = new OCPVaultFactory(address(token), operator);
        token.approve(address(factory), type(uint256).max);
        (vault, market) = factory.createMarket(
            address(token),
            block.timestamp + 7 days,
            1e6,
            1_000e6,
            "Will OCP launch its production LMSR market?",
            "YES: Production LMSR launches. NO: It does not launch. INVALID: The premise cannot be verified."
        );

        vm.stopBroadcast();

        console.log("Local Demo USDC:", address(token));
        console.log("Local OCPVaultFactory:", address(factory));
        console.log("Local Vault:", vault);
        console.log("Local PredictionMarket:", market);
    }
}
