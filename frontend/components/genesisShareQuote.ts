import { isError, type Contract } from "ethers";

export interface GenesisBuyState {
  virtualQuote: bigint; reserve: bigint; tokenReserve: bigint;
  cumulative: bigint; locked: bigint; gap: bigint;
  capitalBps?: bigint;
}
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

/** 新合约公开分配比例；旧合约没有该 selector，仅对空调用回退兼容 15%。 */
export async function readGenesisCapitalBps(g: Contract, opts: { blockTag: number } | Record<string, never> = {}): Promise<bigint> {
  if (typeof g.buyCapitalBps !== "function") return 1500n;
  try {
    return BigInt(await g.buyCapitalBps(opts));
  } catch (error) {
    if (isError(error, "CALL_EXCEPTION") && (error.data == null || error.data === "0x")) return 1500n;
    throw error;
  }
}

/** 用整数重放合约取整，反求满足目标份额的最小预算；不通过多次 RPC 二分报价。 */
export function budgetForGenesisShares(s: GenesisBuyState, shares: bigint): { budget: bigint; maximum: bigint } {
  if (shares <= 0n || s.gap <= 0n) throw new Error("请输入大于零的份额，且市场仍在 Genesis 阶段");
  const cap = ceilDiv(s.gap * 10000n, 9900n);
  const output = (budget: bigint) => {
    const retained = budget * 9900n / 10000n;
    const actualRetained = retained < s.gap ? retained : s.gap;
    const capital = (s.cumulative + actualRetained) * (s.capitalBps ?? 900n) / 9900n - s.locked;
    const curve = actualRetained - capital;
    if (curve <= 0n) return 0n;
    return s.tokenReserve * curve / (s.virtualQuote + s.reserve + curve);
  };
  const maximum = output(cap);
  if (shares > maximum) return { budget: 0n, maximum };
  let low = 1n, high = cap;
  while (low < high) {
    const middle = (low + high) / 2n;
    if (output(middle) >= shares) high = middle;
    else low = middle + 1n;
  }
  return { budget: low, maximum };
}

export async function quoteGenesisShares(g: Contract, isYes: boolean, shares: bigint, decimals: number) {
  const blockTag = await g.runner!.provider!.getBlockNumber();
  const opts = { blockTag };
  const [virtualQuote, supply, sold, reserve, cumulative, locked, threshold, retained, capitalBps] = await Promise.all([
    g.virtualQuote(opts), g.virtualGSupply(opts), isYes ? g.totalGYes(opts) : g.totalGNo(opts),
    isYes ? g.realYesReserve(opts) : g.realNoReserve(opts), g.cumulativeRetainedIn(opts),
    g.lockedGraduationCapital(opts), g.graduationThreshold(opts), g.totalRetainedCapital(opts),
    readGenesisCapitalBps(g, opts),
  ]);
  const result = budgetForGenesisShares({ virtualQuote: BigInt(virtualQuote), reserve: BigInt(reserve), tokenReserve: BigInt(supply) - BigInt(sold), cumulative: BigInt(cumulative), locked: BigInt(locked), gap: BigInt(threshold) - BigInt(retained), capitalBps }, shares);
  if (!result.budget) {
    // 使用截断值，避免把可买上限向上四舍五入成合约无法满足的份额。
    const unit = 10n ** BigInt(decimals);
    const maximum = `${result.maximum / unit}.${(result.maximum % unit).toString().padStart(decimals, "0")}`;
    throw new Error(`毕业前最多可买 ${maximum} g${isYes ? "YES" : "NO"}`);
  }
  const quote = await g.quoteBuy(isYes, result.budget, opts);
  if (BigInt(quote[4]) < shares) throw new Error("报价不足以满足目标份额，请刷新重试");
  return { budget: result.budget, quote };
}
