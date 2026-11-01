# Native gToken units and k=1e-6

TSLA registered kWad=1000000000000 on fresh testnet factory; marketCount confirmed zero, no create-market transaction sent. No buy, stake or lifecycle test transactions sent. Router/stock/USDG/exchange facilities configured; deployment transaction manifest in contracts/topic-market/deployments/46630.json.

Frontend display quantity and price now use the same native 18-decimal gToken units as Solidity. No 10-million multiplier. Stock simulation creation and How lab use k=1e-6; existing old paper markets are excluded via schema3. No legacy migration. Q target and fee rules are unchanged.

327 frontend/server tests passed, 9 external integration tests skipped; TypeScript and testnet build passed. New checks compare small-k quantities and prices against BigInt curve computations. Deployment uses previously verified compiled Solidity artifacts; no Solidity logic changed. Browser verification statuses distinguish confirmed vs submitted.
