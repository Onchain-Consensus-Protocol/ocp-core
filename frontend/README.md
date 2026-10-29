## 2026-10-29 Robinhood 测试网接入

`VITE_MARKET_MODE=testnet` 启用钱包链上入口，固定链46630；`VITE_TOPIC_MARKET_FACTORY` 使用已部署的统一Factory `0x21210a6213D7B1c6D83f393488F0aFC0913EBEd5`。未设置testnet模式时保留原数据库模拟入口。所有写交易显式绑定46630；授权与业务交易分别等待回执。客户端使用frontend/testnet/abi下对应的导出ABI，不调用历史Factory接口。

本地将robinhood-testnet.env.example的公开配置放入.env.testnet，然后运行npm run build:testnet；生产网站由GitHub main推送触发构建，项目环境变量选择testnet。当前工厂已部署，股票登记、测试价格源及USDG兑换配置仍待明确，不展示模拟股票为链上资产。浏览器源码验证尚未成功，不等同部署失败。部署记录见contracts/topic-market/deployments/46630.json。

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
