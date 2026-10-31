// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {TopicMarket} from "../src/TopicMarket.sol";

/// @dev Audit-only checks use public state, keeping assertions out of deployed market bytecode.
function checkMarketInvariants(TopicMarket m) view returns (bool) {
        require(m.singlePool() && address(m.bToken()) == address(0) && m.B() == 0 && m.bTarget() == 0 && m.formalBAccrued() == 0 && m.bBudgetInitial() == 0 && m.bBudgetRemaining() == 0 && m.coverPaid() == 0, "SINGLE_POOL");
        require(m.token().balanceOf(address(m)) >= m.accountedBalance(), "ACCOUNTING");
        if (m.phase() == TopicMarket.Phase.GENESIS) {
            require(address(m.bToken()) == address(0) && m.totalContribution() == 0, "B_REMOVED");
        }
        if (m.phase() == TopicMarket.Phase.FORMAL || m.phase() == TopicMarket.Phase.WAIT_CORE || m.phase() == TopicMarket.Phase.SETTLED) {
            require(m.lpToken().totalSupply() == m.liquiditySupply(), "LP_SUPPLY");
            require(m.lpToken().balanceOf(address(m)) >= m.unmaterializedLP(), "LP_ESCROW");
        }
        if (m.phase() == TopicMarket.Phase.FORMAL || m.phase() == TopicMarket.Phase.WAIT_CORE) {
            require(address(m.bToken()) == address(0) && m.totalContribution() == 0, "B_REMOVED");
            require(m.B() == m.totalContribution() + m.formalBAccrued(), "B_FUNDING");
            require(m.yesSupply() == m.collateralCash() * m.SCALE() && m.noSupply() == m.collateralCash() * m.SCALE(), "PAIR_SUPPLY");
            require(m.collateralCash() + m.redeemedPairs() == m.initialCollateral(), "COLLATERAL_LEDGER");
            require(m.inventoryY() <= m.poolBasisWad() && m.inventoryN() <= m.poolBasisWad(), "COORDINATES");
            require(m.inventoryY() <= m.yesSupply() && m.inventoryN() <= m.noSupply(), "INVENTORY_SUPPLY");
        }
        return true;
}

/// @dev Legacy token reads must not call address(0). Assert no token was deployed instead.
function removedBBalance(TopicMarket m, address) view returns (uint256) {
    require(address(m.bToken()) == address(0), "B_TOKEN_DEPLOYED"); return 0;
}
function removedBSupply(TopicMarket m) view returns (uint256) {
    require(address(m.bToken()) == address(0), "B_TOKEN_DEPLOYED"); return 0;
}
