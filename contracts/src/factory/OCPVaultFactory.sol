// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../core/OCPVault.sol";

/**
 * @title OCPVaultFactory
 * @dev 创建固定截止的公开质押 Vault；Factory 只保存题面与创建记录。
 */
contract OCPVaultFactory {
    address public immutable officialStakeToken;
    address public owner;
    address public pendingOwner;

    address[] public vaults;
    mapping(address => bool) public isVault;

    struct MarketMeta {
        string title;
        string description;
    }

    mapping(address => MarketMeta) private _metaByVault;
    mapping(address => address) private _creatorByVault;

    event MarketCreated(
        address indexed market,
        address indexed vault,
        address indexed creator,
        string title,
        string description
    );
    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address officialStakeToken_) {
        require(officialStakeToken_ != address(0), "Invalid token");
        require(officialStakeToken_.code.length > 0, "Token has no code");
        officialStakeToken = officialStakeToken_;
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    /**
     * @notice 由当前 owner 指定下一任 owner，但本交易不会立即移交权限。
     * @dev 两步交接避免当前 owner 因地址输入错误而永久失去 Factory 管理权。
     *      在 pendingOwner 主动确认前：
     *      1. owner 仍可管理 Factory；
     *      2. pendingOwner 没有任何 owner 权限；
     *      3. owner 可再次调用本函数，用新的候选地址覆盖旧候选地址。
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        require(newOwner != owner, "Already owner");
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /**
     * @notice 候选 owner 主动接收权限，完成不可分割的最终交接。
     * @dev 只有链上记录的 pendingOwner 可以调用。状态更新在同一交易内完成，
     *      因此不存在 owner 已切换但 pendingOwner 尚未清空的中间状态。
     */
    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Only pending owner");
        address previousOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, msg.sender);
    }

    /**
     * @notice 当前 owner 取消尚未完成的权限交接。
     * @dev 仅清空候选地址，不改变当前 owner。
     */
    function cancelOwnershipTransfer() external onlyOwner {
        require(pendingOwner != address(0), "No pending owner");
        pendingOwner = address(0);
        emit OwnershipTransferStarted(owner, address(0));
    }

    function createMarket(
        address stakeToken,
        uint256 resolutionTime,
        uint256 minStake,
        uint256 initialLiquidity,
        string calldata title,
        string calldata description
    ) external onlyOwner returns (address vaultAddr, address marketAddr) {
        require(stakeToken == officialStakeToken, "Unsupported stake token");
        require(resolutionTime > block.timestamp, "Invalid resolutionTime");
        require(minStake > 0, "Invalid min stake");

        OCPVault vault = new OCPVault(address(this), stakeToken, resolutionTime, minStake);

        vaultAddr = address(vault);
        marketAddr = address(0);
        vaults.push(vaultAddr);
        isVault[vaultAddr] = true;
        _metaByVault[vaultAddr] = MarketMeta({title: title, description: description});
        _creatorByVault[vaultAddr] = msg.sender;
        initialLiquidity; // 预测市场预留字段，当前不使用。

        emit MarketCreated(marketAddr, vaultAddr, msg.sender, title, description);
    }

    function getMarkets() external pure returns (address[] memory) {
        return new address[](0);
    }

    function getVaults() external view returns (address[] memory) {
        return vaults;
    }

    function getMarketMeta(address market)
        external
        view
        returns (string memory title, string memory description)
    {
        MarketMeta storage meta = _metaByVault[market];
        return (meta.title, meta.description);
    }

    function getVaultMeta(address vault)
        external
        view
        returns (string memory title, string memory description)
    {
        MarketMeta storage meta = _metaByVault[vault];
        return (meta.title, meta.description);
    }

    function getVaultCreator(address vault) external view returns (address) {
        return _creatorByVault[vault];
    }
}
