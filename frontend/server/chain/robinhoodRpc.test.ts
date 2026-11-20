import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/robinhood-rpc";
import { robinhoodRpcUrl } from "./robinhoodRpc";

async function call(body: unknown) {
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { method: "POST" });
  const res = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
  await handler(req as unknown as IncomingMessage, res as unknown as ServerResponse);
  return { status: res.statusCode, body: JSON.parse(res.end.mock.calls[0][0]) };
}

const request = (method: string, params: unknown[] = [], id = 1) => ({ jsonrpc: "2.0", id, method, params });
const factory = "0x05f0fEE5b8460a773872f8e4e9D23aE109BB3592";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Robinhood read RPC", () => {
  it("routes bounded batch reads to the server-configured URL", async () => {
    vi.stubEnv("ROBINHOOD_RPC_URL", "https://rpc.example/key");
    const fetchMock = vi.fn().mockResolvedValue(Response.json([
      { id: 2, result: "0x1" },
      { id: 1, result: "0x1237" },
    ]));
    vi.stubGlobal("fetch", fetchMock);
    const input = [request("eth_chainId"), request("eth_call", [{ to: factory, data: "0x1234" }, "latest"], 2)];
    const output = await call(input);
    expect(output.status).toBe(200);
    expect(output.body.map((entry: { result: string }) => entry.result)).toEqual(["0x1237", "0x1"]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://rpc.example/key");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)[1].params[0].gas).toBe("0x4c4b40");
  });

  it("rejects writes, state overrides and unbounded log queries before fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const input of [
      request("eth_sendRawTransaction", ["0x1234"]),
      request("eth_call", [{ to: factory }, "latest", {}]),
      request("eth_getLogs", [{ address: factory, fromBlock: "0x0", toBlock: "0x1388" }]),
      request("eth_getLogs", [{ fromBlock: "0x1", toBlock: "0x2" }]),
    ]) {
      expect((await call(input)).status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries only a missing batch reply on the private node then uses the public fallback", async () => {
    vi.stubEnv("ROBINHOOD_RPC_URL", "https://rpc.example/key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json([{ id: 1, result: "0x1237" }, { code: -32000 }]))
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(Response.json({ id: 2, result: "0x12" }));
    vi.stubGlobal("fetch", fetchMock);
    const output = await call([request("eth_chainId"), request("eth_blockNumber", [], 2)]);
    expect(output.body.map((entry: { result: string }) => entry.result)).toEqual(["0x1237", "0x12"]);
    expect(fetchMock.mock.calls.slice(1).map(([url, init]) => [url, JSON.parse(init.body).id])).toEqual([
      ["https://rpc.example/key", 2],
      ["https://rpc.mainnet.chain.robinhood.com", 2],
    ]);
  });

  it("keeps upstream error details private", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      id: 1, error: { code: -32602, message: "https://rpc.example/key", data: { url: "https://rpc.example/key" } },
    })));
    const output = await call(request("eth_chainId"));
    expect(output.body.error).toEqual({ code: -32602, message: "Upstream RPC rejected the request" });
  });

  it("uses the public RPC when a deployment has no Secret", () => {
    vi.stubEnv("ROBINHOOD_RPC_URL", "");
    expect(robinhoodRpcUrl()).toBe("https://rpc.mainnet.chain.robinhood.com");
  });
});
