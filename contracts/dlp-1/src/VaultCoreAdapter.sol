// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {DLPMarket, IDLPCore, IToken6} from "./DLPMarket.sol";
import {OCPVault} from "ocp/core/OCPVault.sol";

interface ILegacyVault {
    function market() external view returns (address);
    function originalResolutionTime() external view returns (uint256);
    function effectiveResolutionTime() external view returns (uint256);
    function permissionlessCreator() external view returns (address);
    function earlyTerminationEnabled() external view returns (bool);
    function resolved() external view returns (bool);
    function settlementReady() external view returns (bool);
    function outcome() external view returns (uint8);
    function stakeToken() external view returns (address);
}

interface IFormalFlag {
    function isFormalMarket() external view returns (bool);
    function token() external view returns (address);
}

/// @notice Creates an existing OCPVault with this immutable adapter as its factory.
/// No path calls enableEarlyTermination; fixed deadlines cannot be shortened through the legacy factory.
/// No keeper can set results. This is an isolated launch route, not the production Factory.
/// @dev Existing vault itself gates staking using market.isFormalMarket(). Adapter does NOT modify vault.
contract VaultCoreAdapter is IDLPCore {
    ILegacyVault public immutable vault;
    address public immutable binder;
    IToken6 public immutable feeToken;
    uint256 private entered = 1;
    address public market;
    uint64 public openedAt;
    uint64 public deadline;

    constructor(IToken6 token_, address creator_, address protocol_, uint64 end_) {
        OCPVault created = new OCPVault(address(this), address(token_), end_, 0, protocol_);
        created.configurePermissionless(creator_, false);
        vault = ILegacyVault(address(created));
        binder = msg.sender;
        feeToken = token_;
    }

    address public trustedForwarder;
    function configureForwarder(address forwarder) external {
        require(msg.sender == binder && market == address(0) && trustedForwarder == address(0), "FORWARDER_CONFIG");
        require(forwarder.code.length > 0, "FORWARDER_CODE");
        trustedForwarder = forwarder;
        OCPVault(address(vault)).setTrustedForwarder(forwarder);
    }

    function bind(address market_) external {
        require(msg.sender == binder && market == address(0) && market_.code.length > 0, "BIND");
        market = market_;
        OCPVault(address(vault)).bindMarket(market_);
        // Vault保留真实市场绑定；只额外授权本适配器转交同一市场手续费。
        OCPVault(address(vault)).setMarketCoordinator(address(this));
        OCPVault(address(vault)).authorizeAdditionalMarket(address(this));
    }

    function open(uint64 end) external {
        require(msg.sender == market && openedAt == 0, "OPEN");
        require(
            vault.market() == market && vault.permissionlessCreator() != address(0) && !vault.earlyTerminationEnabled(),
            "VAULT_CONFIG"
        );
        require(
            vault.originalResolutionTime() == end && vault.effectiveResolutionTime() == end && !vault.resolved(),
            "VAULT_TIME"
        );
        require(
            IFormalFlag(market).isFormalMarket() && IFormalFlag(market).token() == vault.stakeToken(), "MARKET_CONFIG"
        );
        deadline = end;
        openedAt = uint64(block.timestamp);
    }

    function depositMarketFee(uint256 amount) external {
        require(msg.sender == market && openedAt > 0 && entered == 1, "FEE_MARKET");
        require(amount > 0, "AMOUNT");
        entered = 2;
        uint256 beforeBalance = feeToken.balanceOf(address(this));
        require(feeToken.transferFrom(msg.sender, address(this), amount), "FEE_PULL");
        require(feeToken.balanceOf(address(this)) == beforeBalance + amount, "FEE_EXACT");
        require(feeToken.approve(address(vault), 0) && feeToken.approve(address(vault), amount), "FEE_APPROVE");
        // Vault按当前质押历史索引记账，失败整笔回滚；不把费用加到多数本金。
        OCPVault(address(vault)).depositMarketFee(amount);
        require(feeToken.balanceOf(address(this)) == beforeBalance, "FEE_DRAIN");
        require(feeToken.approve(address(vault), 0), "FEE_APPROVE");
        entered = 1;
    }

    /// @notice Permissionless, atomic Core + market finalization after the fixed deadline.
    /// @dev An already-finalized component is skipped; no caller may choose the result.
    function finalizeMarket() external {
        require(openedAt > 0 && block.timestamp >= deadline && entered == 1, "PENDING");
        entered = 2;
        if (!vault.resolved()) OCPVault(address(vault)).finalize();
        if (DLPMarket(market).phase() != DLPMarket.Phase.SETTLED) DLPMarket(market).finalize();
        entered = 1;
    }

    function finalOutcome() external view returns (uint8) {
        require(openedAt > 0 && block.timestamp >= deadline, "PENDING");
        require(vault.effectiveResolutionTime() == deadline, "CORE_TIME_CHANGED");
        if (!vault.resolved() || !vault.settlementReady()) return 0;
        uint8 result = vault.outcome();
        require(result >= 1 && result <= 3, "RESULT");
        return result;
    }
}
