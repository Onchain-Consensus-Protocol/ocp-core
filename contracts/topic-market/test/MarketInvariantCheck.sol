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
            require(m.inventoryY() == 0 && m.inventoryN() == 0 && m.collateralCash() == 0, "NO_PREMINT");
            require(m.cash() >= (m.yesSupply() + m.SCALE() - 1) / m.SCALE() && m.cash() >= (m.noSupply() + m.SCALE() - 1) / m.SCALE(), "OUTCOME_SOLVENCY");
            (uint256 qY,uint256 qN)=m.coordinates();require(qY==m.yesSupply() && qN==m.noSupply(), "OUTSTANDING_COORDINATES");
        }
        return true;
}

/// @dev A removed selector has no fallback and reverts without an encoded compatibility error.
function assertSelectorRemoved(address target, bytes memory data) view {
    require(target.code.length > 0, "MISSING_TARGET");
    (bool success, bytes memory returned)=target.staticcall(data);
    require(!success && returned.length == 0, "REMOVED_SELECTOR_PRESENT");
}
