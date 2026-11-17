# Paper simulation and How it works: early settlement

Frontend/server simulation only; no Solidity changes or public transactions.

- Full Core exit refunds principal less ceil(10%) and forfeits historical conditional fees. Exit is separate from the proposal UI and remains available after Formal closes, until the Core cutoff or a due request.
- Any player can propose YES/NO with nonempty reason, total principal >0 and 500 USD-equivalent collateral fixed at creation. Window is 3600 seconds and must end strictly before original Core cutoff. Non-leading proposals are allowed.
- Window end pauses trade/stake/exit until a player processes. Strict-majority match settles with logical cutoff at window end and separate pull bond refund; mismatch forfeits bond, resumes only operations before original deadlines, or settles normally if original Core cutoff has passed.
- Pending direction/countdown/action is visible at market-card width and in market listings. Separate collapsed exit/proposal panels. Multiplayer controls use authenticated quote/trade API with revision, idempotency and payment bounds; multiplayer time stays server-controlled.
- How it works has bilingual rules and a local model-driven interactive lab.
- Existing single-R schema2 paper markets receive empty lifecycle defaults without recalculating funds or reintroducing B.

Validation: 311 frontend/server tests passed, 9 external integration tests skipped; TypeScript and testnet build passed. Tests cover real HTTP propose/process/refund and exit actions, due freezes, failed requests, late processing, exact deadline rejection, non-leading proposals, fee forfeiture and ledger conservation. No new contract test/fork run required for this frontend-only change.
