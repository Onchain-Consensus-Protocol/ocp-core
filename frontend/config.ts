/**
 * 前端配置：API 与网络
 * 构建时从环境变量读取，未设置时使用 Base Mainnet 默认值
 */
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;

/** Base Mainnet 当前部署的工厂与代币地址 */
const DEFAULT_FACTORY_ADDRESS = "0xe343be8F1d8572937da49234882e6a1eF4FFEb26";
const DEFAULT_DEPOSIT_TOKEN_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export const config = {
  /** ocp-api 根地址，如 https://your-api.vercel.app */
  apiBase: env?.VITE_API_BASE ?? "",
  /** 官方 Vault 工厂地址（用于读取已创建的 Vault） */
  factoryAddress: env?.VITE_FACTORY_ADDRESS ?? DEFAULT_FACTORY_ADDRESS,
  /** 默认质押代币地址 */
  depositTokenAddress: env?.VITE_DEPOSIT_TOKEN_ADDRESS ?? DEFAULT_DEPOSIT_TOKEN_ADDRESS,
  /** 链 ID: Base Mainnet 8453 */
  chainId: parseInt(env?.VITE_CHAIN_ID ?? "8453", 10),
  /** RPC URL，用于钱包与合约读取 */
  rpcUrl: env?.VITE_RPC_URL ?? "https://base.publicnode.com",
  /** 区块浏览器 */
  explorer: env?.VITE_EXPLORER ?? "https://basescan.org",
  /** 预测市场功能开关（默认关闭，可用 VITE_MARKET_ENABLED=true 开启） */
  marketEnabled: env?.VITE_MARKET_ENABLED === "true",
};

export const VAULT_ABI = [
  "function stake(uint8 side, uint256 amount) external",
  "function donate(uint256 amount) external",
  "function finalize() external",
  "function withdraw() external",
  "function protocolVersion() external pure returns (uint256)",
  "function factory() external view returns (address)",
  "function stakeToken() external view returns (address)",
  "function resolutionTime() external view returns (uint256)",
  "function minStake() external view returns (uint256)",
  "function totalPrincipal() external view returns (uint256)",
  "function totalDonations() external view returns (uint256)",
  "function settlementPool() external view returns (uint256)",
  "function remainingEligibleClaims() external view returns (uint256)",
  "function totalStakeYes() external view returns (uint256)",
  "function totalStakeNo() external view returns (uint256)",
  "function totalStakeInvalid() external view returns (uint256)",
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
  "function feeBps() external view returns (uint256)",
  "function resolutionTime() external view returns (uint256)",
  "function resolved() external view returns (bool)",
  "function outcome() external view returns (uint8)",
  "function yesReserve() external view returns (uint256)",
  "function noReserve() external view returns (uint256)",
  "function getYesNoPrice() external view returns (uint256 yesPrice, uint256 noPrice)",
  "function yesShares(address) external view returns (uint256)",
  "function noShares(address) external view returns (uint256)",
  "function totalYesShares() external view returns (uint256)",
  "function totalNoShares() external view returns (uint256)",
  "function buyYes(uint256 amountIn, uint256 minOut) external returns (uint256 amountOut)",
  "function buyNo(uint256 amountIn, uint256 minOut) external returns (uint256 amountOut)",
  "function sellYes(uint256 amountIn, uint256 minOut) external returns (uint256 amountOut)",
  "function sellNo(uint256 amountIn, uint256 minOut) external returns (uint256 amountOut)",
  "function resolve() external",
  "function redeem(uint256 yesAmount, uint256 noAmount) external returns (uint256 payout)",
] as const;
