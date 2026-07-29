/**
 * 前端配置：API 与网络
 * 构建时从环境变量读取，未设置时使用 Base Mainnet 默认值
 */
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;

/** Base Mainnet 当前唯一支持的 V5 Factory 与原生 USDC */
const DEFAULT_FACTORY_ADDRESS = "0x97B33092848a38Bb1abCAD3FEf0c72e2e3B8bBf0";
const DEFAULT_DEPOSIT_TOKEN_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const config = {
  /** ocp-api 根地址，如 https://your-api.vercel.app */
  apiBase: env?.VITE_API_BASE ?? "",
  /** 官方 Vault 工厂地址（用于读取已创建的 Vault） */
  factoryAddress: env?.VITE_FACTORY_ADDRESS ?? DEFAULT_FACTORY_ADDRESS,
  /** 默认质押代币地址 */
  depositTokenAddress: env?.VITE_DEPOSIT_TOKEN_ADDRESS ?? DEFAULT_DEPOSIT_TOKEN_ADDRESS,
  /** Vault 与 LMSR 市场由同一个官方 Factory 原子创建并登记 */
  marketFactoryAddress:
    env?.VITE_MARKET_FACTORY_ADDRESS
    ?? env?.VITE_FACTORY_ADDRESS
    ?? DEFAULT_FACTORY_ADDRESS,
  /** 链 ID: Base Mainnet 8453 */
  chainId: parseInt(env?.VITE_CHAIN_ID ?? "8453", 10),
  /** RPC URL，用于钱包与合约读取 */
  rpcUrl: env?.VITE_RPC_URL ?? "https://base.gateway.tenderly.co",
  /** 区块浏览器 */
  explorer: env?.VITE_EXPLORER ?? "https://basescan.org",
  /** V5 Factory 原子创建 Vault + LMSR Market；仅可显式设为 false 关闭 */
  marketEnabled: env?.VITE_MARKET_ENABLED !== "false",
};

export const VAULT_ABI = [
  "function stake(uint8 side, uint256 amount) external",
  "function donate(uint256 amount) external",
  "function finalize() external",
  "function withdraw() external",
  "function claimMarketFeesFor(address user) external returns (uint256)",
  "function claimOfficialMarketFees() external returns (uint256)",
  "function claimSurplus() external returns (uint256)",
  "function protocolVersion() external pure returns (uint256)",
  "function factory() external view returns (address)",
  "function emptySettlementRecipient() external view returns (address)",
  "function stakeToken() external view returns (address)",
  "function resolutionTime() external view returns (uint256)",
  "function minStake() external view returns (uint256)",
  "function totalPrincipal() external view returns (uint256)",
  "function totalDonations() external view returns (uint256)",
  "function settlementPool() external view returns (uint256)",
  "function remainingSettlementPool() external view returns (uint256)",
  "function remainingEligibleClaims() external view returns (uint256)",
  "function totalStakeYes() external view returns (uint256)",
  "function totalStakeNo() external view returns (uint256)",
  "function totalStakeInvalid() external view returns (uint256)",
  "function market() external view returns (address)",
  "function settlementReady() external view returns (bool)",
  "function marketFeesInSettlementPool() external view returns (uint256)",
  "function totalMarketFeesAccrued() external view returns (uint256)",
  "function marketFeeUserPoolRemaining() external view returns (uint256)",
  "function officialMarketFeesClaimable() external view returns (uint256)",
  "function conditionalMarketFees(address user) external view returns (uint256 yesFees, uint256 noFees, uint256 invalidFees)",
  "function claimableMarketFees(address user) external view returns (uint256)",
  "function emptySettlementClaimable() external view returns (uint256)",
  "function stakeOf(address user) external view returns (uint256 yesAmount, uint256 noAmount, uint256 invalidAmount)",
  "function canResolve() external view returns (bool)",
  "function resolved() external view returns (bool)",
  "function outcome() external view returns (uint8)",
  "event Staked(address indexed user, uint8 indexed side, uint256 amount, uint256 totalAmount)",
] as const;

export const FACTORY_ABI = [
  "function createMarket(address stakeToken, uint256 resolutionTime, uint256 minStake, uint256 initialLiquidity, string title, string description) external returns (address vaultAddr, address marketAddr)",
  "function owner() external view returns (address)",
  "function officialStakeToken() external view returns (address)",
  "function pendingOwner() external view returns (address)",
  "function isVault(address vault) external view returns (bool)",
  "function isMarket(address market) external view returns (bool)",
  "function marketByVault(address vault) external view returns (address)",
  "function vaultByMarket(address market) external view returns (address)",
  "function officialLiquidityPool() external view returns (address)",
  "function vaultDeployer() external view returns (address)",
  "function marketDeployer() external view returns (address)",
  "function getMarkets() external view returns (address[])",
  "function getMarketMeta(address market) external view returns (string title, string description)",
  "function getVaults() external view returns (address[])",
  "function getVaultMeta(address vault) external view returns (string title, string description)",
  "function getVaultCreator(address vault) external view returns (address)",
  "function transferOwnership(address newOwner) external",
  "function acceptOwnership() external",
  "function cancelOwnershipTransfer() external",
  "event MarketCreated(address indexed market, address indexed vault, address indexed creator, string title, string description)",
  "event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner)",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
] as const;

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
  "function totalSupply() external view returns (uint256)",
] as const;

/** 带 mint 的 ERC20（仅测试网可用） */
export const ERC20_MINT_ABI = [
  ...ERC20_ABI,
  "function mint(address to, uint256 amount) external",
] as const;

export const MARKET_ABI = [
  "function vault() external view returns (address)",
  "function collateral() external view returns (address)",
  "function factory() external view returns (address)",
  "function officialLiquidityPool() external view returns (address)",
  "function subsidyProvider() external view returns (address)",
  "function subsidy() external view returns (uint256)",
  "function conditionType() external view returns (uint8)",
  "function conditionParams() external view returns (bytes)",
  "function feeBps() external view returns (uint256)",
  "function vaultFeeBps() external view returns (uint256)",
  "function protocolLpFeeBps() external view returns (uint256)",
  "function feeEscrow() external view returns (uint256)",
  "function pendingVaultFees() external view returns (uint256)",
  "function pendingProtocolLpFees() external view returns (uint256)",
  "function totalVaultFeesPaid() external view returns (uint256)",
  "function totalTradingVolume() external view returns (uint256)",
  "function liquidityParameter() external view returns (uint256)",
  "function requiredSubsidy() external view returns (uint256)",
  "function activated() external view returns (bool)",
  "function resolutionTime() external view returns (uint256)",
  "function resolved() external view returns (bool)",
  "function outcome() external view returns (uint8)",
  "function getYesNoPrice() external view returns (uint256 yesPrice, uint256 noPrice)",
  "function yesShares(address) external view returns (uint256)",
  "function noShares(address) external view returns (uint256)",
  "function totalYesShares() external view returns (uint256)",
  "function totalNoShares() external view returns (uint256)",
  "function quoteBuy(bool isYes, uint256 sharesOut) external view returns (uint256 totalCost, uint256 fee)",
  "function quoteSell(bool isYes, uint256 sharesIn) external view returns (uint256 netPayout, uint256 fee)",
  "function buyYes(uint256 sharesOut, uint256 maxTotalCost, uint256 deadline) external returns (uint256 totalCost)",
  "function buyNo(uint256 sharesOut, uint256 maxTotalCost, uint256 deadline) external returns (uint256 totalCost)",
  "function sellYes(uint256 sharesIn, uint256 minPayout, uint256 deadline) external returns (uint256 netPayout)",
  "function sellNo(uint256 sharesIn, uint256 minPayout, uint256 deadline) external returns (uint256 netPayout)",
  "function resolve() external",
  "function redeem() external returns (uint256 payout)",
  "function claimProtocolLpFees() external returns (uint256 amount)",
  "event FeeAccrued(address indexed trader, uint256 grossCashFlow, uint256 totalFee, uint256 vaultFee, uint256 protocolLpFee)",
  "event MarketActivated(address indexed subsidyProvider, uint256 subsidy, uint256 liquidityParameter)",
] as const;

export const MARKET_FACTORY_ABI = [
  "function isVault(address vault) external view returns (bool)",
  "function isMarket(address market) external view returns (bool)",
  "function marketByVault(address vault) external view returns (address)",
  "function vaultByMarket(address market) external view returns (address)",
] as const;
