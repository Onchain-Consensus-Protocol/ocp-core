import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Contract, JsonRpcProvider, Wallet, getAddress, keccak256, toUtf8Bytes } from 'ethers';
import { Chain } from './chain.mjs';
import { REVIEW, WEEK, isCutoff, tree, weeklyCutoff, winnerProof } from './lottery.mjs';

const FACTORY = '0x05f0fEE5b8460a773872f8e4e9D23aE109BB3592';
const FACTORY_BLOCK = 116603318;
const EVMNET = '04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3';
const DRAND_ENDPOINTS = ['https://api.drand.sh', 'https://api2.drand.sh', 'https://api3.drand.sh'];
const LOTTERY_ABI = [
  'function lockRound(uint64 cutoff,bytes32 root,uint256 totalWeight,address[] tokens,uint256[] fees,bytes32 auditDigest)',
  'function pendingRound() view returns (uint64 cutoff,uint64 drandRound,bytes32 root,uint256 totalWeight)',
  'function lastCutoff() view returns (uint64)',
  'function drawIndex(bytes signature) view returns (uint256)',
  'function draw(bytes signature,address winner,uint256 weight,bytes32[] siblingHashes,uint256[] siblingWeights,bool[] siblingOnLeft)',
  'function unallocated(address token) view returns (uint256)',
  'function syncDeposits(address token) returns (uint256)',
  'function expirePending()',
];
const now = () => Math.floor(Date.now() / 1000);
const key = process.env.LOTTERY_KEEPER_KEY;
const store = resolve(process.env.LOTTERY_DATA_DIR ?? './data');
const transactionHashPattern = /^0x[0-9a-f]{64}$/i;
const signaturePattern = /^[0-9a-f]{128}$/i;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

function positiveInteger(name, fallback) {
  const number = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`Invalid ${name}`);
  return number;
}

async function readSnapshot(round, state) {
  try {
    return await readFile(resolve(store, `${round}-${state}.json`), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

async function saveSnapshot(round, state, contents) {
  // 写完临时文件后再原子替换，避免 Mac 重启时留下半份名单。
  const temporary = resolve(store, `${randomUUID()}.tmp`);
  await writeFile(temporary, contents, { flag: 'wx', mode: 0o600 });
  await rename(temporary, resolve(store, `${round}-${state}.json`));
}

function serialize(snapshot, snapshotStatus) {
  return JSON.stringify({ ...snapshot, snapshotStatus }, null, 2) + '\n';
}

function send(response, status, jsonText, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', ...headers });
  response.end(jsonText);
}

async function postBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 2048) throw new Error('Request too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function drandSignature(round) {
  for (const endpoint of DRAND_ENDPOINTS) {
    try {
      const response = await fetch(`${endpoint}/${EVMNET}/public/${round}`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) continue;
      const proof = await response.json();
      if (Number(proof.round) === Number(round) && signaturePattern.test(proof.signature)) return `0x${proof.signature}`;
    } catch {
      // A failed relay cannot change the fixed beacon round.
    }
  }
  return null;
}

async function readReports(round) {
  const text = await readSnapshot(round, 'reports');
  return text ? JSON.parse(text) : [];
}

async function runTransactions() {
  if (!lottery || !key) return;

  const pending = await lottery.pendingRound();
  const pendingCutoff = Number(pending.cutoff);
  if (pendingCutoff) {
    if (now() >= pendingCutoff + REVIEW + WEEK) {
      await (await lottery.expirePending()).wait(1, 120_000);
      return;
    }
    const text = await readSnapshot(pendingCutoff, 'final');
    if (!text) throw new Error(`Restore publicly published final audit for round ${pendingCutoff}`);

    const snapshot = JSON.parse(text);
    const weights = tree(snapshot.round, snapshot.wallets);
    if (weights.hash !== pending.root || weights.weight !== pending.totalWeight) {
      throw new Error('Saved proof tree does not match the on-chain commitment');
    }
    const signature = await drandSignature(pending.drandRound);
    if (!signature) return;
    const index = await lottery.drawIndex(signature);
    const proof = winnerProof(weights, index);
    await (await lottery.draw(signature, proof.address, proof.weight, proof.siblingHashes,
      proof.siblingWeights, proof.siblingOnLeft)).wait(1, 120_000);
    console.log(`Round ${pendingCutoff} awarded to ${proof.address}`);
    return;
  }

  const cutoff = weeklyCutoff(now() - REVIEW);
  if (BigInt(cutoff) <= await lottery.lastCutoff()) return;
  const text = await readSnapshot(cutoff, 'final');
  if (!text) return;
  const snapshot = JSON.parse(text);
  if (!snapshot.prizes.length || !BigInt(snapshot.totalWeight)) return;
  for (const { token, amount } of snapshot.prizes) {
    const funded = await lottery.unallocated(token);
    if (funded >= BigInt(amount)) continue;
    // 用户可直接 ERC-20 转账；差额实际到账时才同步，不走额外的资金授权。
    const received = await lottery.syncDeposits.staticCall(token);
    if (funded + received < BigInt(amount)) throw new Error(`Prize deposit missing for ${token}`);
    await (await lottery.syncDeposits(token)).wait(1, 120_000);
  }
  const prizes = snapshot.prizes;
  await (await lottery.lockRound(cutoff, snapshot.root, BigInt(snapshot.totalWeight),
    prizes.map(({ token }) => token), prizes.map(({ amount }) => BigInt(amount)),
    keccak256(toUtf8Bytes(text)))).wait(1, 120_000);
  console.log(`Round ${cutoff} locked`);
}

async function tick() {
  let snapshotError;
  try {
    const cutoff = weeklyCutoff(now());
    if (cutoff >= startCutoff && now() < cutoff + REVIEW) {
      const current = await readSnapshot(cutoff, 'review');
      const reports = await readReports(cutoff);
      if (!current || JSON.parse(current).reports.length !== reports.length) {
        const review = await chain.snapshot(cutoff, cutoff, reports);
        await saveSnapshot(cutoff, 'review', serialize(review, 'review'));
      }
    }
    const active = weeklyCutoff(now() - REVIEW);
    const existing = await readSnapshot(active, 'final');
    const shouldBuild = active >= startCutoff && (!lottery || BigInt(active) > await lottery.lastCutoff());
    if (shouldBuild && !existing) {
      await reportWrites;
      const snapshot = await chain.snapshot(active, active + REVIEW, await readReports(active));
      await saveSnapshot(active, 'final', serialize(snapshot, 'final'));
      console.log(`Round ${active} audit built, ${snapshot.wallets.length} eligible wallets`);
    }
  } catch (error) {
    snapshotError = error;
  }
  await runTransactions();
  if (snapshotError) throw snapshotError;
}

let reportWrites = Promise.resolve();
let activeReports = 0;
const reportsInFlight = new Set();
function recordReport(cutoff, transactionHash) {
  const next = reportWrites.then(async () => {
    if (now() >= cutoff + REVIEW) return false;
    const reports = await readReports(cutoff);
    if (!reports.includes(transactionHash)) {
      await saveSnapshot(cutoff, 'reports', JSON.stringify([...reports, transactionHash]));
    }
    return true;
  });
  reportWrites = next.catch(() => {});
  return next;
}

async function latestRound() {
  const files = await readdir(store);
  const rounds = files.map((name) => Number(name.match(/^(\d+)-(review|final)\.json$/)?.[1])).filter(isCutoff);
  return rounds.length ? Math.max(...rounds) : null;
}

async function serve(request, response) {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'OPTIONS') {
    response.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
    response.end();
    return;
  }
  if (request.method === 'GET' && url.pathname === '/draw-proof') {
    if (!lottery) return send(response, 404, '{"error":"No lottery configured"}');
    const pending = await lottery.pendingRound();
    const cutoff = Number(pending.cutoff);
    if (!cutoff || now() >= cutoff + REVIEW + WEEK) return send(response, 404, '{"error":"No drawable round"}');
    const text = await readSnapshot(cutoff, 'final');
    if (!text) return send(response, 404, '{"error":"Final audit unavailable"}');
    const weights = tree(cutoff, JSON.parse(text).wallets);
    if (pending.root !== weights.hash || pending.totalWeight !== weights.weight) throw new Error('Audit does not match root');
    const signature = await drandSignature(pending.drandRound);
    if (!signature) return send(response, 404, '{"error":"Signed beacon unavailable"}');
    const proof = winnerProof(weights, await lottery.drawIndex(signature));
    return send(response, 200, JSON.stringify({ cutoff, signature, ...proof },
      (_, member) => typeof member === 'bigint' ? member.toString() : member));
  }
  if (request.method === 'GET' && ['/snapshot', '/audit'].includes(url.pathname)) {
    const round = url.searchParams.has('round') ? Number(url.searchParams.get('round')) : await latestRound();
    if (!isCutoff(round)) return send(response, 404, '{"error":"Audit not available"}');
    const final = await readSnapshot(round, 'final');
    const text = final ?? (url.pathname === '/snapshot' ? await readSnapshot(round, 'review') : null);
    if (!text) return send(response, 404, '{"error":"Audit not available"}');
    return send(response, 200, text, final ? { 'X-Audit-Digest': keccak256(toUtf8Bytes(text)),
      'Access-Control-Expose-Headers': 'X-Audit-Digest' } : {});
  }
  if (request.method === 'POST' && url.pathname === '/report') {
    let body;
    try {
      body = await postBody(request);
    } catch {
      return send(response, 400, '{"error":"Expected a short JSON request"}');
    }
    const transactionHash = typeof body?.transactionHash === 'string' ? body.transactionHash.toLowerCase() : '';
    if (!transactionHashPattern.test(transactionHash)) return send(response, 400, '{"error":"Invalid transaction hash"}');
    const cutoff = weeklyCutoff(now());
    if (now() >= cutoff + REVIEW || cutoff < startCutoff || (body.round !== undefined && body.round !== cutoff)) {
      return send(response, 409, '{"error":"This round is not accepting reports"}');
    }

    const known = await readReports(cutoff);
    const review = await readSnapshot(cutoff, 'review');
    if (known.includes(transactionHash) || (review && JSON.parse(review).trades.some((trade) => trade.transactionHash === transactionHash))) {
      return send(response, 200, JSON.stringify({ accepted: true, added: 0, transactionHash }));
    }
    if (activeReports >= 2 || reportsInFlight.has(transactionHash)) {
      return send(response, 429, '{"error":"Keeper is busy, retry shortly"}', { 'Retry-After': '10' });
    }
    activeReports++;
    reportsInFlight.add(transactionHash);
    try {
      // 公共请求只核对这一笔回执；同一轮的历史扫描由定时任务合并执行。
      const added = await chain.validateReport(cutoff, transactionHash);
      if (!added) return send(response, 400, '{"error":"Transaction has no eligible market trade"}');
      if (!await recordReport(cutoff, transactionHash)) return send(response, 409, '{"error":"The review window has closed"}');
      return send(response, 202, JSON.stringify({ accepted: true, added, queued: true, transactionHash }));
    } finally {
      activeReports--;
      reportsInFlight.delete(transactionHash);
    }
  }
  return send(response, 404, '{"error":"Not found"}');
}

const primaryUrl = requireEnv('ROBINHOOD_RPC_URL');
const backupUrl = requireEnv('ROBINHOOD_BACKUP_RPC_URL');
if (primaryUrl === backupUrl) throw new Error('Use two independent RPC endpoints');
const rpc = new JsonRpcProvider(primaryUrl);
const backup = new JsonRpcProvider(backupUrl);
const chain = new Chain({ rpc, backup, factory: FACTORY, factoryBlock: FACTORY_BLOCK,
  logSpan: positiveInteger('LOTTERY_LOG_SPAN', 5000), maxPriceAge: positiveInteger('LOTTERY_MAX_PRICE_AGE', 345600) });
const lotteryAddress = process.env.LOTTERY_ADDRESS ? getAddress(process.env.LOTTERY_ADDRESS) : null;
if (key && !lotteryAddress) throw new Error('Set LOTTERY_ADDRESS before enabling transaction submission');
const lottery = lotteryAddress ? new Contract(lotteryAddress, LOTTERY_ABI, key ? new Wallet(key, rpc) : rpc) : null;
const startCutoff = Number(requireEnv('LOTTERY_FIRST_CUTOFF'));
if (!isCutoff(startCutoff)) throw new Error('LOTTERY_FIRST_CUTOFF must be a Sunday 12:00 UTC Unix timestamp');

await chain.assertNetwork();
if (process.argv[2] === 'inspect-market') {
  const ledger = await chain.inspectMarket(getAddress(process.argv[3]));
  process.stdout.write(JSON.stringify(ledger, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n');
  rpc.destroy();
  backup.destroy();
  process.exit(0);
}
if (process.argv[2] === 'snapshot') {
  const cutoff = Number(process.argv[3]);
  if (!isCutoff(cutoff)) throw new Error('Provide a Sunday 12:00 UTC Unix timestamp');
  const status = process.argv.includes('--review') ? 'review' : 'final';
  const snapshot = await chain.snapshot(cutoff, cutoff + (status === 'review' ? 0 : REVIEW));
  process.stdout.write(serialize(snapshot, status));
  rpc.destroy();
  backup.destroy();
  process.exit(0);
}
await mkdir(store, { recursive: true, mode: 0o700 });

createServer((request, response) => {
  serve(request, response).catch((error) => {
    console.error(error.shortMessage ?? error.message);
    if (!response.headersSent) send(response, 503, '{"error":"Keeper could not verify the request"}');
  });
}).listen(positiveInteger('LOTTERY_PORT', 8787), process.env.LOTTERY_HOST ?? '127.0.0.1');

const wake = async () => {
  try {
    await tick();
  } catch (error) {
    console.error(error.shortMessage ?? error.message);
  }
  setTimeout(wake, positiveInteger('LOTTERY_POLL_SECONDS', 60) * 1000);
};
void wake();
