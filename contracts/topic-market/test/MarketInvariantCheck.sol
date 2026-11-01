// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {TopicMarket} from "../src/TopicMarket.sol";

/// @dev Audit-only checks use public state, keeping assertions out of deployed market bytecode.
function checkMarketInvariants(TopicMarket m) view returns (bool) {

        require(m.token().balanceOf(address(m)) >= m.accountedBalance(), "ACCOUNTING");
        if (m.phase() == TopicMarket.Phase.FORMAL || m.phase() == TopicMarket.Phase.WAIT_CORE || m.phase() == TopicMarket.Phase.SETTLED) {
            require(m.lpToken().totalSupply() == m.liquiditySupply(), "LP_SUPPLY");
            require(m.lpToken().balanceOf(address(m)) >= m.unmaterializedLP(), "LP_ESCROW");
        }
        if (m.phase() == TopicMarket.Phase.FORMAL || m.phase() == TopicMarket.Phase.WAIT_CORE) {
            require(m.yesSupply() == m.collateralCash() * m.SCALE() && m.noSupply() == m.collateralCash() * m.SCALE(), "PAIR_SUPPLY");
            require(m.collateralCash() + m.redeemedPairs() == m.initialCollateral(), "COLLATERAL_LEDGER");
            require(m.inventoryY() <= m.poolBasisWad() && m.inventoryN() <= m.poolBasisWad(), "COORDINATES");
            require(m.inventoryY() <= m.yesSupply() && m.inventoryN() <= m.noSupply(), "INVENTORY_SUPPLY");
        }
        return true;
}

/// @dev A removed selector has no fallback and reverts without an encoded compatibility error.
function assertSelectorRemoved(address target, bytes memory data) view {
    require(target.code.length > 0, "MISSING_TARGET");
    (bool success, bytes memory returned)=target.staticcall(data);
    require(!success && returned.length == 0, "REMOVED_SELECTOR_PRESENT");
}
