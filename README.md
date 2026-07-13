# OCP — OnChain Consensus Protocol

OCP（OnChain Consensus Protocol，共识上链协议）旨在把公开争议转化为链上可编程的最终共识。

协议核心是 **Proof of Commitment（POC，承诺证明）**：参与者通过资本锁定表达立场，经过质押、锁定与一次性终局流程，输出 YES / NO / INVALID 三态结果。OCP 不声称生产绝对真理，而是输出资本对某一结果的可验证承诺，即 **Finalized Consensus**。

Stake War 采用单一公开质押期：YES、NO、INVALID 全程开放；同一地址只能选择一侧并同侧追加，不能撤回或换边。截止时间固定，不会延长。



---

## 目录结构

```
./
├── contracts/        Solidity 智能合约 — OCPVault、预测市场与事件账本
├── frontend/         前端 UI — OCP/POC 模拟、机制说明、测试网浏览与演示
├── infra/            基础设施
└── docs/             文档
│   ├── whitepaper/     白皮书
│   ├── ops/            部署与运维
│   └── testing/        测试与安全报告
```

---

## 核心组件

### contracts/ — 智能合约

Foundry 项目。协议核心与应用实验都在这里。

| 合约 | 用途 |
|------|------|
| `OCPVault` + `OCPVaultFactory` | 公开质押 → 固定截止 → 比例结算 |
| `PredictionMarket` | 预测市场应用层状态展示 |

```bash
cd contracts && forge build && forge test
```

### frontend/ — 前端

React + Vite，部署在 Vercel。包含 OCP/POC 模拟器、机制解释、AI/Infra/Bridge 未来愿景演示与测试网浏览页。

```bash
cd frontend && npm install && npm run dev
```

---

## 部署

| 服务 | 平台 | 目录 |
|------|------|------|
| 前端 | Vercel | `frontend/` |
| 合约 | Base Sepolia（测试）/ Base（正式） | `contracts/` |

详见 [部署指南](docs/ops/DEPLOY.md)。

---

## 文档索引

| 文档 | 说明 |
|------|------|
| [OCP 白皮书 (中文)](docs/whitepaper/OCP_WHITEPAPER_CN.md) | 协议设计与共识机制 |
| [OCP Whitepaper (EN)](docs/whitepaper/OCP_WHITEPAPER_EN.md) | English version |
| [POC 白皮书 (中文)](docs/whitepaper/POC_WHITEPAPER_CN.md) | 承诺证明机制、博弈论与协议哲学 |
| [部署指南](docs/ops/DEPLOY.md) | 测试网部署步骤 |
