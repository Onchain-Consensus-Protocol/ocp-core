import type { IncomingMessage, ServerResponse } from "node:http";
import { robinhoodRpcUrl } from "../server/chain/robinhoodRpc.js";
import { ROBINHOOD_PUBLIC_RPC } from "../shared/robinhoodNetwork.js";

const ADDRESS = /^0x[0-9a-f]{40}$/i;
const HASH = /^0x[0-9a-f]{64}$/i;
const DATA = /^0x(?:[0-9a-f]{2}){0,4096}$/i;
const QUANTITY = /^0x[0-9a-f]{1,16}$/i;
const BLOCK_TAGS = new Set(["latest", "pending", "safe", "finalized", "earliest"]);
const MAX_BODY = 64_000;
const MAX_BATCH = 100;

type RpcId = string | number | null;
type RpcCall = { jsonrpc: "2.0"; id: RpcId; method: string; params: unknown[] };
type JsonObject = Record<string, unknown>;

function object(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function matches(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.test(value);
}
function blockTag(value: unknown): boolean {
  return typeof value === "string" && (BLOCK_TAGS.has(value) || QUANTITY.test(value));
}

function validateCall(value: unknown): value is RpcCall {
  if (!object(value) || value.jsonrpc !== "2.0" || typeof value.method !== "string") return false;
  if (!(value.id === null || Number.isSafeInteger(value.id) || (typeof value.id === "string" && value.id.length <= 64))) return false;
  if (!Array.isArray(value.params ?? [])) return false;
  const params = (value.params ?? []) as unknown[];
  const [first, second] = params;
  switch (value.method) {
    case "eth_chainId":
    case "eth_blockNumber":
      return params.length === 0;
    case "eth_getCode":
    case "eth_getBalance":
      return params.length === 2 && matches(first, ADDRESS) && blockTag(second);
    case "eth_getBlockByNumber":
      return params.length === 2 && blockTag(first) && second === false;
    case "eth_getBlockByHash":
      return params.length === 2 && matches(first, HASH) && second === false;
    case "eth_getTransactionByHash":
    case "eth_getTransactionReceipt":
      return params.length === 1 && matches(first, HASH);
    case "eth_call":
      return params.length === 2 && blockTag(second) && object(first)
        && matches(first.to, ADDRESS) && matches(first.data ?? first.input ?? "0x", DATA)
        && (first.from === undefined || matches(first.from, ADDRESS))
        && Object.keys(first).every(key => ["to", "data", "input", "from"].includes(key));
    case "eth_getLogs":
      if (params.length !== 1 || !object(first) || !matches(first.address, ADDRESS)
        || !matches(first.fromBlock, QUANTITY) || !matches(first.toBlock, QUANTITY)
        || !Object.keys(first).every(key => ["address", "fromBlock", "toBlock", "topics"].includes(key))) return false;
      return BigInt(first.fromBlock) <= BigInt(first.toBlock) && BigInt(first.toBlock) - BigInt(first.fromBlock) < 5000n
        && (first.topics === undefined || (Array.isArray(first.topics) && first.topics.length <= 4 &&
          first.topics.every(topic => topic === null || matches(topic, HASH) ||
            (Array.isArray(topic) && topic.length <= 8 && topic.every(item => matches(item, HASH))))));
    default:
      return false;
  }
}

function errorReply(id: RpcId, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function safeReply(response: unknown, call: RpcCall) {
  if (!object(response) || response.id !== call.id) return errorReply(call.id, -32000, "Upstream RPC unavailable");
  if (object(response.error)) {
    const { code, data, message } = response.error;
    const reason = typeof message === "string" && /block range|query returned more|response size|too many logs/i.test(message)
      ? "RPC block range or response size limit"
      : code === 3 || (typeof message === "string" && /execution reverted/i.test(message))
        ? "execution reverted" : "Upstream RPC rejected the request";
    const safeCode = typeof code === "number" && Number.isSafeInteger(code) ? code : -32000;
    return {
      jsonrpc: "2.0", id: call.id,
      error: { code: safeCode, message: reason, ...(reason === "execution reverted" && matches(data, DATA) ? { data } : {}) },
    };
  }
  return "result" in response ? { jsonrpc: "2.0", id: call.id, result: response.result }
    : errorReply(call.id, -32000, "Upstream RPC unavailable");
}

async function fetchRpc(url: string, payload: RpcCall | RpcCall[], deadline: AbortSignal): Promise<unknown> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.any([deadline, AbortSignal.timeout(5000)]),
      redirect: "error",
    });
    return response.ok ? await response.json() : undefined;
  } catch {
    return undefined;
  }
}

function usable(response: unknown, id: RpcId): boolean {
  if (!object(response) || response.id !== id) return false;
  if ("result" in response) return true;
  if (!object(response.error)) return false;
  const code = response.error.code;
  return code !== -32005 && code !== 429;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  function reply(status: number, response: unknown) {
    res.statusCode = status;
    res.end(JSON.stringify(response));
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    reply(405, errorReply(null, -32600, "POST required"));
    return;
  }
  let body: unknown;
  try {
    const pieces: Buffer[] = [];
    let size = 0;
    for await (const value of req) {
      const piece = Buffer.isBuffer(value) ? value : Buffer.from(value);
      size += piece.length;
      if (size > MAX_BODY) {
        reply(413, errorReply(null, -32600, "Request too large"));
        return;
      }
      pieces.push(piece);
    }
    body = JSON.parse(Buffer.concat(pieces).toString("utf8"));
  } catch {
    reply(400, errorReply(null, -32700, "Invalid JSON"));
    return;
  }

  const batched = Array.isArray(body);
  const calls: unknown[] = Array.isArray(body) ? body : [body];
  if (!calls.length || calls.length > MAX_BATCH || !calls.every(validateCall) ||
    new Set(calls.map(call => call.id)).size !== calls.length) {
    reply(400, errorReply(null, -32600, "Invalid or unsupported read request"));
    return;
  }
  try {
    const upstreamCalls: RpcCall[] = calls.map(({ id, method, params }) => ({
      jsonrpc: "2.0", id, method,
      // 仅允许常规读调用。限制模拟 gas，禁用调用方状态覆盖和交易发送。
      params: method === "eth_call" ? [{ ...(params[0] as JsonObject), gas: "0x4c4b40" }, params[1]] : params ?? [],
    }));
    const primary = robinhoodRpcUrl();
    const deadline = AbortSignal.timeout(12_000);
    const payload = await fetchRpc(primary, batched ? upstreamCalls : upstreamCalls[0], deadline);
    const responses = Array.isArray(payload) ? payload : [payload];
    const byId = new Map(responses.filter(object).map(value => [value.id, value]));
    // 部分 RPC 会在批量响应里漏掉 id。只重试缺失的读请求，保留其余成功结果。
    const missing = upstreamCalls.filter(call => !usable(byId.get(call.id), call.id));
    for (let start = 0; start < missing.length && !deadline.aborted; start += 8) {
      await Promise.all(missing.slice(start, start + 8).map(async call => {
        let value = batched ? await fetchRpc(primary, call, deadline) : byId.get(call.id);
        if (!usable(value, call.id) && primary !== ROBINHOOD_PUBLIC_RPC) {
          value = await fetchRpc(ROBINHOOD_PUBLIC_RPC, call, deadline);
        }
        if (object(value) && usable(value, call.id)) byId.set(call.id, value);
      }));
    }
    const output = calls.map(call => safeReply(byId.get(call.id), call));
    reply(200, batched ? output : output[0]);
  } catch {
    const output = calls.map(call => errorReply(call.id, -32000, "Upstream RPC unavailable"));
    reply(200, batched ? output : output[0]);
  }
}
