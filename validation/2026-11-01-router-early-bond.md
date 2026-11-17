# Routed early-settlement bonds

Append Router actions ProposeEarly=11 and ClaimEarlyBond=12, and bytes32 reasonHash to the typed request. Funding proposals target the registered market's Core and forward the actual player. Core pulls the fixed creation-time bond; converted surplus stock returns to the player. Refunds pull only that player's refundable bond, then atomically swap to the selected asset with minimum-output protection. Failed funding or swaps revert the entire transaction including proposal/refund ledger changes. Processing remains Adapter.finalizeMarket with no exchange.

Frontend supports USDG proposal quote/approval/payment and USDG refund preview/minimum output, while retaining direct stock payment/claim. Proposal quotes are scoped to market, wallet, chain, payment asset, side, reason and revision and reject stale requests. Factory interfaceVersion is 3; older versions are rejected because the Router request tuple has changed.

Validation: 15 stock integration tests passed, including fixed 500USD-equivalent bond, surplus collateral refund, underfunding rollback (exchange and Core paths), correct proposer attribution, refund swap failure preserving debt, and successful stablecoin refund. Frontend 313 passed, 9 external integration skipped; TypeScript and testnet build passed; ABI encoding checked against compiled artifacts. Full non-RH local contract regression passed (forge exit 0).

No public transactions or new deployments performed.
