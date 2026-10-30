## 2026-10-29 模拟默认入口与独立测试网入口

主市场 `/`（market域名）及 `/explore.html` 默认保留原有邮箱登录、数据库模拟市场和Simulation完整交互；不由VITE_MARKET_MODE切成链上模式。独立入口 `/testnet.html` 接入46630测试网，两页导航互相链接。已有模拟数据和交易逻辑不变。下方先前的默认testnet入口描述由本节取代。

## 2026-10-29 最新测试网部署

独立入口为 `https://market.ocp-protocol.org/testnet.html`，固定链46630；普通市场入口仍为模拟。公开配置 `VITE_TOPIC_MARKET_FACTORY=0xB5C08A89F11D18A62361b87Dc963379281CA6D82` 由Vercel构建环境提供；`.env.testnet`只用于本地testnet构建，不控制默认页面模式。

TSLA和官方测试USDG使用已有真实V3池，匹配带deadline的兑换适配器。R=.0036及B=.0006 TSLA双门槛；固定测试价400USD/TSLA仅用于500U保证金换算（1.25 TSLA），不提供假ETH行情。独立提前结算模块每市场创建并固定绑定。已真实验证0.1USDG路由买入、原生TSLA毕业、Core质押及90%退出；不会把分叉中的完整结算测试描述为测试网上已到期结算。

部署记录见contracts/topic-market/deployments/46630.json；源码验证状态独立记录，提交成功不等于已经验证。

# OCP Market

React/Vite frontend and PostgreSQL-backed multiplayer paper-trading server. All balances and trades in the public application are simulated.

## Local setup

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Configure your own `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `DATABASE_URL` and `PAPER_ALLOWED_ORIGINS`. Allowed origins must match the local URL. Never expose server credentials through `VITE_` variables or commit real environment files.

Clerk provides email-verification login. Each authenticated account receives100,000 virtual USD once. Public application information and privacy pages are available without login.

## Checks

```sh
npm test
npx tsc --noEmit
npm run build
```

Real PostgreSQL integration tests run only when `PAPER_TEST_DATABASE_URL` points to a disposable test database. Without it, those tests are skipped. Never use a production database for tests.

## Hosting

Deploy `frontend/` as a Vite project. Build with `npm run build` and publish `dist/`; the server API is `api/paper.ts`. The included Vercel configuration serves `explore.html` at the Market hostname root. Set authentication and database variables in the hosting environment.


### Testnet interface (2026-10-30)

`testnet.html` reuses the simulation detail layout with chain-backed balances, prices, and event history. The default paper market stays available separately. Core unstaking and early-resolution requests have separate controls; market trading selects YES/NO in a dropdown.

The payment selector supports registered USDG through the existing stock/USDG V3 pool and AssetRouter. Quotes use the matching QuoterV2 and pinned-block pool checks, never the fixed test collateral oracle. Formal buying swaps the entire displayed maximum USDG budget; unused stock is refunded as stock. Approvals and execution are separate wallet confirmations, pinned to chain 46630.

Receiving escrowed LP tokens transfers the token to the wallet without withdrawing pool collateral. LP payout requires settlement; B payout requires settlement or failed Genesis. No-principal Core cannot accept an early request; ties/INVALID with principal do not prohibit a YES/NO request, but an unmatched outcome after the window forfeits the bond.


### Local history cache
Verified historical logs are persisted in browser IndexedDB, scoped to testnet chain, factory, market and schema. The UI labels cached statistics and refreshes new blocks in the background. Checkpoint/creation hashes and Genesis supply are checked before saving; a mismatch rebuilds history. SHA-256 detects accidental cache damage, not malicious local rewriting. Quotes, balances and transaction authorization never use this cache. Browser storage failure falls back to chain reads. First visits and cleared browser data require the initial scan.
