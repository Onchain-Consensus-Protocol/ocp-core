// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice 每个市场独立发行的18位权益代币；标准转让，只有市场可以铸造或结算销毁。
/// @dev 不暴露用户任意burn入口，避免终局前主动缩小分配分母；无owner升级或外部铸币权。
contract DLPRightsToken is ERC20 {
    address public immutable market;
    modifier onlyMarket() {
        require(msg.sender == market, "ONLY_MARKET");
        _;
    }
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        market = msg.sender;
    }
    function mint(address to, uint256 amount) external onlyMarket { _mint(to, amount); }
    function burn(address from, uint256 amount) external onlyMarket { _burn(from, amount); }
}
