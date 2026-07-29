import { afterEach, describe, expect, it, vi } from "vitest";
import { keccak256 } from "ethers";
import {
  ADMIN_FACTORY,
  blockscoutTransactionMatchesIntent,
  findTransactionBySenderNonce,
  type BlockscoutTransaction,
  type PendingIntent,
} from "./admin";

const OWNER = "0x1556a9A5C01ecc4eF11e751CacC847DD36971be7";
const CALLDATA = "0x12345678";

function intent(): PendingIntent {
  return {
    version: 1,
    stage: "awaiting_signature",
    from: OWNER,
    nonce: 29,
    intentBlock: 48_733_000,
    submittedAt: Date.now() - 120_000,
    title: "test",
    description: "YES: yes\nNO: no\nINVALID: invalid",
    preparedBlockTimestamp: 1_700_000_000,
    durationSeconds: 86_400,
    resolutionTime: 1_700_086_400,
    minStake: "1000000",
    gasEstimate: "1000000",
    calldataHash: keccak256(CALLDATA),
  };
}

function indexedTransaction(overrides: Partial<BlockscoutTransaction> = {}): BlockscoutTransaction {
  return {
    hash: `0x${"ab".repeat(32)}`,
    nonce: 29,
    raw_input: CALLDATA,
    value: "0",
    block_number: 48_733_053,
    from: { hash: OWNER },
    to: { hash: ADMIN_FACTORY },
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("pending intent transaction matching", () => {
  it("accepts only the same sender, nonce, factory, zero value and calldata", () => {
    expect(blockscoutTransactionMatchesIntent(indexedTransaction(), intent())).toBe(true);
  });

  it("rejects a same-nonce replacement with different calldata", () => {
    expect(blockscoutTransactionMatchesIntent(
      indexedTransaction({ raw_input: "0x87654321" }),
      intent(),
    )).toBe(false);
  });

  it("rejects a transaction sent to another target", () => {
    expect(blockscoutTransactionMatchesIntent(
      indexedTransaction({ to: { hash: "0x0000000000000000000000000000000000000001" } }),
      intent(),
    )).toBe(false);
  });
});

describe("Blockscout sender + nonce lookup", () => {
  it("follows bounded pagination and finds the historical nonce", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [indexedTransaction({ nonce: 63 })],
        next_page_params: { filter: "from", items_count: 50, block_number: 49_000_000 },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [indexedTransaction()],
        next_page_params: null,
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await findTransactionBySenderNonce(OWNER, 29);

    expect(result?.nonce).toBe(29);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("items_count=50");
  });

  it("returns null when the address history is exhausted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [indexedTransaction({ nonce: 30 })],
      next_page_params: null,
    }), { status: 200 })));

    await expect(findTransactionBySenderNonce(OWNER, 29)).resolves.toBeNull();
  });

  it("surfaces an indexer failure instead of unlocking", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));

    await expect(findTransactionBySenderNonce(OWNER, 29)).rejects.toThrow("HTTP 503");
  });
});
