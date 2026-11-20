import { FetchRequest } from "ethers";
import { ROBINHOOD_PUBLIC_RPC } from "../../shared/robinhoodNetwork.js";

export function robinhoodRpcUrl(): string {
  const configured = process.env.ROBINHOOD_RPC_URL?.trim();
  if (!configured) return ROBINHOOD_PUBLIC_RPC;
  try {
    if (new URL(configured).protocol === "https:") return configured;
  } catch { /* Do not expose the value in an error. */ }
  throw new Error("Invalid server RPC configuration");
}

export function robinhoodRpcRequest(): FetchRequest {
  const request = new FetchRequest(robinhoodRpcUrl());
  request.timeout = 8000;
  return request;
}
