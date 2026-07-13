# OCP 浏览器 / OCP Explorer

OCP 协议展示前端：模拟演示（Simulation）、机制说明、AI 对齐演示，以及**测试网命题**（真实链上金库 + 人类参与投票）。

## 本地运行

1. `npm install`
2. 可选：复制 [.env.example](.env.example) 为 `.env`，配置：
   - **VITE_API_BASE** — OCP API 根地址（可选）
   - VITE_CHAIN_ID、VITE_RPC_URL、VITE_EXPLORER — 测试网与区块浏览器（用于钱包与合约调用）
3. `npm run dev`

## Stake War 页面

- Vault 由官方 Factory 创建，普通用户前端提供浏览、质押、结算和领取功能。
- 用户连接钱包后，可按照 Vault 当前阶段调用 `stake`、`finalize` 或 `withdraw`。
- 部署见 [../docs/ops/DEPLOY.md](../docs/ops/DEPLOY.md)。
