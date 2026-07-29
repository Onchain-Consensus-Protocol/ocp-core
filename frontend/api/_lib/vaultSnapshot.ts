const BASE_RPC_URL = process.env.BASE_RPC_URL ?? "https://base.publicnode.com";

const SELECTOR = {
  factory: "0xc45a0155",
  stakeToken: "0x51ed6a30",
  totalStakeYes: "0x84c8eeb3",
  totalStakeNo: "0xd5e77612",
  totalStakeInvalid: "0x938a6a73",
  resolved: "0x3f6fa655",
  outcome: "0x27793f87",
  settlementPool: "0xaac0297a",
  getVaultMeta: "0x1adeafed",
  isVault: "0x652b9b41",
  decimals: "0x313ce567",
  symbol: "0x95d89b41",
} as const;

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export interface VaultSnapshot {
  vault: string;
  blockNumber: number;
  title: string;
  tokenSymbol: string;
  tokenDecimals: number;
  yesRaw: bigint;
  noRaw: bigint;
  invalidRaw: bigint;
  totalRaw: bigint;
  yesAmount: string;
  noAmount: string;
  invalidAmount: string;
  totalAmount: string;
  yesPct: string;
  noPct: string;
  invalidPct: string;
  resolved: boolean;
  outcome: number;
  settlementPoolRaw: bigint;
  settlementPoolAmount: string;
}

export function isAddress(value: string | null): value is string {
  return Boolean(value && ADDRESS_RE.test(value));
}

function word(data: string, index: number): string {
  const clean = data.startsWith("0x") ? data.slice(2) : data;
  return clean.slice(index * 64, (index + 1) * 64);
}

function decodeUint(data: string): bigint {
  return BigInt(data || "0x0");
}

function decodeAddress(data: string): string {
  const clean = data.startsWith("0x") ? data.slice(2) : data;
  return `0x${clean.slice(-40)}`;
}

function decodeStringAt(data: string, offsetBytes: number): string {
  const clean = data.startsWith("0x") ? data.slice(2) : data;
  const offset = offsetBytes * 2;
  const length = Number(BigInt(`0x${clean.slice(offset, offset + 64) || "0"}`));
  const value = clean.slice(offset + 64, offset + 64 + length * 2);
  return new TextDecoder().decode(Uint8Array.from(value.match(/.{1,2}/g) ?? [], (byte) => parseInt(byte, 16)));
}

function decodeString(data: string): string {
  const offset = Number(BigInt(`0x${word(data, 0) || "0"}`));
  return decodeStringAt(data, offset);
}

function decodeStringPair(data: string): [string, string] {
  const firstOffset = Number(BigInt(`0x${word(data, 0) || "0"}`));
  const secondOffset = Number(BigInt(`0x${word(data, 1) || "0"}`));
  return [decodeStringAt(data, firstOffset), decodeStringAt(data, secondOffset)];
}

function encodeAddress(address: string): string {
  return address.slice(2).toLowerCase().padStart(64, "0");
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(BASE_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (response.status === 429 && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    if (!response.ok) throw new Error(`Base RPC returned HTTP ${response.status}`);
    const payload = await response.json() as { result?: T; error?: { message?: string } };
    const errorMessage = payload.error?.message ?? "";
    if (payload.error && /rate limit|too many requests/i.test(errorMessage) && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    if (payload.error || payload.result === undefined) {
      throw new Error(errorMessage || `Base RPC ${method} failed`);
    }
    return payload.result;
  }
  throw new Error(`Base RPC ${method} failed after retry`);
}

async function rpcBatch<T>(calls: Array<{ method: string; params: unknown[] }>): Promise<T[]> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(BASE_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(calls.map((call, index) => ({ jsonrpc: "2.0", id: index + 1, ...call }))),
    });
    if (response.status === 429 && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    if (!response.ok) throw new Error(`Base RPC returned HTTP ${response.status}`);
    const payload = await response.json() as Array<{ id: number; result?: T; error?: { message?: string } }> | { error?: { message?: string } };
    const topLevelError = Array.isArray(payload) ? "" : payload.error?.message ?? "";
    if (!Array.isArray(payload) && /rate limit|too many requests/i.test(topLevelError) && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    if (!Array.isArray(payload)) throw new Error(topLevelError || "Base RPC did not return a batch response");
    const batchRateLimited = payload.some((item) => /rate limit|too many requests/i.test(item.error?.message ?? ""));
    if (batchRateLimited && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    const byId = new Map(payload.map((item) => [item.id, item]));
    return calls.map((_, index) => {
      const item = byId.get(index + 1);
      if (!item || item.error || item.result === undefined) {
        throw new Error(item?.error?.message ?? "Base RPC batch call failed");
      }
      return item.result;
    });
  }
  throw new Error("Base RPC batch call failed after retry");
}

async function ethCall(to: string, data: string, blockTag: string): Promise<string> {
  return rpc<string>("eth_call", [{ to, data }, blockTag]);
}

async function ethCallBatch(calls: Array<{ to: string; data: string }>, blockTag: string): Promise<string[]> {
  return rpcBatch<string>(calls.map(({ to, data }) => ({
    method: "eth_call",
    params: [{ to, data }, blockTag],
  })));
}

async function optionalEthCall(to: string, data: string, blockTag: string): Promise<string | null> {
  try {
    return await ethCall(to, data, blockTag);
  } catch {
    return null;
  }
}

function formatToken(raw: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const fraction = (raw % base).toString().padStart(decimals, "0").slice(0, 2).padEnd(2, "0");
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped}.${fraction}`;
}

function formatPct(raw: bigint, total: bigint): string {
  if (total === 0n) return "0.0%";
  const tenths = (raw * 1000n + total / 2n) / total;
  return `${tenths / 10n}.${tenths % 10n}%`;
}

export async function loadVaultSnapshot(vault: string, requestedBlock?: number): Promise<VaultSnapshot> {
  if (!isAddress(vault)) throw new Error("Invalid Vault address");

  // 固定快照块由后续 eth_call 自行验证是否存在，避免每次 OG 抓取额外消耗一次
  // 公共 RPC 配额；未指定块时才读取 latest。
  const blockNumber = requestedBlock ?? Number(BigInt(await rpc<string>("eth_blockNumber", [])));
  if (!Number.isSafeInteger(blockNumber) || blockNumber <= 0) {
    throw new Error("Invalid snapshot block");
  }
  const blockTag = `0x${blockNumber.toString(16)}`;

  const factory = decodeAddress(await ethCall(vault, SELECTOR.factory, blockTag));
  if (!isAddress(factory)) throw new Error("Vault factory is invalid");

  const [registeredData, stakeTokenData, yesData, noData, invalidData, metaData] = await ethCallBatch([
    { to: factory, data: `${SELECTOR.isVault}${encodeAddress(vault)}` },
    { to: vault, data: SELECTOR.stakeToken },
    { to: vault, data: SELECTOR.totalStakeYes },
    { to: vault, data: SELECTOR.totalStakeNo },
    { to: vault, data: SELECTOR.totalStakeInvalid },
    { to: factory, data: `${SELECTOR.getVaultMeta}${encodeAddress(vault)}` },
  ], blockTag);
  if (decodeUint(registeredData) === 0n) throw new Error("Address is not registered by its OCP Factory");

  // 结算状态读取合并为一个 JSON-RPC batch，避免 OG 爬虫触发公共 RPC 的突发限流。
  // 旧 Vault 若不支持这些 getter，再退回逐项兼容读取。
  let resolvedData: string | null;
  let outcomeData: string | null;
  let settlementPoolData: string | null;
  try {
    [resolvedData, outcomeData, settlementPoolData] = await ethCallBatch([
      { to: vault, data: SELECTOR.resolved },
      { to: vault, data: SELECTOR.outcome },
      { to: vault, data: SELECTOR.settlementPool },
    ], blockTag);
  } catch {
    resolvedData = await optionalEthCall(vault, SELECTOR.resolved, blockTag);
    outcomeData = await optionalEthCall(vault, SELECTOR.outcome, blockTag);
    settlementPoolData = await optionalEthCall(vault, SELECTOR.settlementPool, blockTag);
  }

  const stakeToken = decodeAddress(stakeTokenData);
  const [decimalsData, symbolData] = await ethCallBatch([
    { to: stakeToken, data: SELECTOR.decimals },
    { to: stakeToken, data: SELECTOR.symbol },
  ], blockTag);

  const yesRaw = decodeUint(yesData);
  const noRaw = decodeUint(noData);
  const invalidRaw = decodeUint(invalidData);
  const totalRaw = yesRaw + noRaw + invalidRaw;
  const resolved = resolvedData ? decodeUint(resolvedData) !== 0n : false;
  const outcome = outcomeData ? Number(decodeUint(outcomeData)) : 0;
  // V4 在 finalize 时把真实 token 余额快照进 settlementPool。旧 Vault 没有该
  // getter 时回退到公开本金，保证原有进行中 OG 仍可正常生成。
  const settlementPoolRaw = settlementPoolData ? decodeUint(settlementPoolData) : totalRaw;
  const [title] = decodeStringPair(metaData);
  const tokenDecimals = Number(decodeUint(decimalsData));
  const tokenSymbol = decodeString(symbolData).slice(0, 12) || "TOKEN";

  return {
    vault,
    blockNumber,
    title: title.trim().slice(0, 180) || "OCP Consensus Vault",
    tokenSymbol,
    tokenDecimals,
    yesRaw,
    noRaw,
    invalidRaw,
    totalRaw,
    yesAmount: formatToken(yesRaw, tokenDecimals),
    noAmount: formatToken(noRaw, tokenDecimals),
    invalidAmount: formatToken(invalidRaw, tokenDecimals),
    totalAmount: formatToken(totalRaw, tokenDecimals),
    yesPct: formatPct(yesRaw, totalRaw),
    noPct: formatPct(noRaw, totalRaw),
    invalidPct: formatPct(invalidRaw, totalRaw),
    resolved,
    outcome,
    settlementPoolRaw,
    settlementPoolAmount: formatToken(settlementPoolRaw, tokenDecimals),
  };
}
