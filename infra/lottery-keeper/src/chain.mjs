import { Contract, Interface, ZeroAddress } from 'ethers';
import { WEEK, REVIEW, replayFees, tradeFee, usdWeight, tree, compareAddresses } from './lottery.mjs';

const FACTORY_ABI = [
  'function marketCount() view returns (uint256)',
  'function isMarket(address) view returns (bool)',
  'function markets(uint256) view returns (address)',
  'function marketCollateral(address) view returns (address)',
  'function protocol() view returns (address)',
  'function stocks(address) view returns (address priceOracle,address trustedForwarder,uint256 k,uint8 decimals,bool enabled)',
  'function marketRecord(address) view returns ((address creator,address adapter,address vault,uint64 createdAt,uint64 formalCutoff,uint64 coreCutoff,uint64 topicCutoff,uint256 snapshot,string topic,string yesRule,string noRule,string invalidRule))',
];
const MARKET_ABI = [
  'function phase() view returns (uint8)',
  'function protocolFees() view returns (uint256)',
  'event GenesisTrade(address indexed user,bool buy,uint256 base,uint256 quantity)',
  'event FormalTrade(address indexed user,bool buy,bool isYes,uint256 amount,uint256 base)',
  'event Closed(uint8 phase)',
  'event Finalized(uint8 result,uint256 lpBudget)',
  'event FeePayout(address indexed recipient,uint256 amount,bool paid)',
  'event DustCollected(uint256 amount)',
];
const ORACLE_ABI = ['function stockUsd() view returns (address)'];
const FEED_ABI = [
  'function latestRoundData() view returns (uint80 round,int256 answer,uint256 start,uint256 updated,uint80 answered)',
  'function decimals() view returns (uint8)',
];
const MARKET_INTERFACE = new Interface(MARKET_ABI);
const phaseNames = { 3: 'SETTLED', 4: 'FAILED' };
const topic = (name) => MARKET_INTERFACE.getEvent(name).topicHash;
const lifecycleTopics = ['Closed', 'Finalized'].map(topic);
const evidenceTopics = ['GenesisTrade', 'FormalTrade', 'FeePayout', 'DustCollected'].map(topic);
const logOrder = (a, b) => a.blockNumber - b.blockNumber || a.index - b.index;

function canonicalLog(log) {
  return JSON.stringify([log.blockHash, log.transactionHash, log.index, log.address, log.topics, log.data]);
}

function parse(log) {
  const { name, args } = MARKET_INTERFACE.parseLog(log);
  return { name, args, transactionHash: log.transactionHash, blockNumber: log.blockNumber, logIndex: log.index };
}

export class Chain {
  constructor({ rpc, backup, factory, factoryBlock, logSpan, maxPriceAge }) {
    Object.assign(this, { rpc, backup, factory, factoryBlock, logSpan, maxPriceAge });
    this.factoryContract = new Contract(factory, FACTORY_ABI, rpc);
  }

  async assertNetwork() {
    for (const provider of [this.rpc, this.backup]) {
      if ((await provider.getNetwork()).chainId !== 4663n) throw new Error('Keeper expects Robinhood mainnet (4663)');
    }
  }

  async block(number) {
    const first = await this.rpc.getBlock(number);
    const second = await this.backup.getBlock(number);
    if (!first || !second || first.hash !== second.hash) throw new Error(`RPCs disagree on block ${number}`);
    return first;
  }

  async confirmedHead(now) {
    const [first, second] = await Promise.all([this.rpc.getBlock('finalized'), this.backup.getBlock('finalized')]);
    if (!first || !second) throw new Error('Confirmed head is unavailable');
    const block = await this.block(Math.min(first.number, second.number));
    if (block.timestamp < now) throw new Error('Waiting for a finalized block after the snapshot time');
    return block.number;
  }

  async lastBefore(timestamp, high) {
    let low = 0;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      const block = await this.rpc.getBlock(middle);
      if (!block) throw new Error(`Missing historical block ${middle}`);
      if (block.timestamp < timestamp) low = middle;
      else high = middle - 1;
    }
    const block = await this.block(low);
    const next = await this.block(low + 1);
    if (block.timestamp >= timestamp || next.timestamp < timestamp) throw new Error('Could not resolve canonical cutoff');
    return block;
  }

  async agreed(contractAddress, abi, method, args, blockTag) {
    const call = async (provider) => new Contract(contractAddress, abi, provider)[method](...args, { blockTag });
    const [first, second] = await Promise.all([call(this.rpc), call(this.backup)]);
    const encode = (value) => JSON.stringify(value, (_, member) => typeof member === 'bigint' ? member.toString() : member);
    if (encode(first) !== encode(second)) throw new Error(`RPCs disagree on ${method} at block ${blockTag}`);
    return first;
  }

  async logs(address, topics, fromBlock, toBlock) {
    const combined = [];
    for (let start = fromBlock; start <= toBlock; start += this.logSpan) {
      const end = Math.min(start + this.logSpan - 1, toBlock);
      const filter = { address, topics: [topics], fromBlock: start, toBlock: end };
      const [first, second] = await Promise.all([this.rpc.getLogs(filter), this.backup.getLogs(filter)]);
      first.sort(logOrder);
      second.sort(logOrder);
      if (first.length === second.length && first.every((log, index) => canonicalLog(log) === canonicalLog(second[index]))) {
        combined.push(...first);
        continue;
      }
      // 日志查询缺页时，按双方的规范回执复核全部争议日志，再合并去重。
      const txHashes = new Set([...first, ...second].map(({ transactionHash }) => transactionHash));
      for (const hash of txHashes) {
        const receipt = await this.receipt(hash);
        combined.push(...receipt.logs.filter((log) => log.address === address && topics.includes(log.topics[0])
          && log.blockNumber >= start && log.blockNumber <= end));
      }
    }
    return combined.sort(logOrder);
  }

  async receipt(transactionHash) {
    const [first, second] = await Promise.all([
      this.rpc.getTransactionReceipt(transactionHash),
      this.backup.getTransactionReceipt(transactionHash),
    ]);
    if (!first || !second || first.status !== 1 || second.status !== 1 || first.blockHash !== second.blockHash
      || first.logs.length !== second.logs.length
      || first.logs.some((log, index) => canonicalLog(log) !== canonicalLog(second.logs[index]))) {
      throw new Error('No matching successful transaction receipt from both RPCs');
    }
    const block = await this.block(first.blockNumber);
    if (block.hash !== first.blockHash) throw new Error('Receipt is not on the canonical chain');
    return first;
  }

  async roundBounds(cutoff) {
    if (this.bounds?.cutoff !== cutoff) {
      const finalized = await this.confirmedHead(cutoff);
      const [prior, current] = await Promise.all([this.lastBefore(cutoff - WEEK, finalized), this.lastBefore(cutoff, finalized)]);
      this.bounds = { cutoff, prior, current };
    }
    return this.bounds;
  }

  async validateReport(cutoff, transactionHash) {
    const [receipt, { prior, current }] = await Promise.all([this.receipt(transactionHash), this.roundBounds(cutoff)]);
    if (current.number < this.factoryBlock || receipt.blockNumber > current.number) return 0;
    const eligible = new Map();
    let count = 0;
    for (const log of receipt.logs) {
      if (!evidenceTopics.slice(0, 2).includes(log.topics[0]) || tradeFee(parse(log).args.base) === 0n) continue;
      if (!eligible.has(log.address)) {
        const isMarket = await this.agreed(this.factory, FACTORY_ABI, 'isMarket', [log.address], current.number);
        const ended = isMarket && phaseNames[Number(await this.agreed(log.address, MARKET_ABI, 'phase', [], current.number))];
        const alreadyExisted = ended && prior.number >= this.factoryBlock
          && await this.agreed(this.factory, FACTORY_ABI, 'isMarket', [log.address], prior.number);
        const endedEarlier = alreadyExisted && phaseNames[Number(await this.agreed(log.address, MARKET_ABI, 'phase', [], prior.number))];
        eligible.set(log.address, Boolean(ended && !endedEarlier));
      }
      if (eligible.get(log.address)) count++;
    }
    return count;
  }

  async marketLedger({ address, firstBlock, throughBlock, creator, protocol, reportLogs = [] }) {
    const history = await this.logs(address, evidenceTopics, Math.max(firstBlock, this.factoryBlock), throughBlock);
    const byIndex = new Map(history.map((log) => [log.index + ':' + log.blockNumber, log]));
    for (const log of reportLogs) {
      if (log.address !== address || log.blockNumber < firstBlock || log.blockNumber > throughBlock
        || !evidenceTopics.slice(0, 2).includes(log.topics[0])) continue;
      const key = log.index + ':' + log.blockNumber;
      const same = byIndex.get(key);
      if (same && canonicalLog(same) !== canonicalLog(log)) throw new Error('Reported log conflicts with canonical log');
      byIndex.set(key, log);
    }
    const { claimedTrades, paidTradeFees, accruedTradeFees, pendingProtocol } = replayFees(
      [...byIndex.values()].sort(logOrder).map(parse), { creator, protocol },
    );
    const actualUnpaid = await this.agreed(address, MARKET_ABI, 'protocolFees', [], throughBlock);
    if (actualUnpaid !== pendingProtocol) throw new Error(`Protocol fee ledger does not reconcile for ${address}`);
    return { claimedTrades, paidTradeFees, accruedTradeFees, pendingProtocol };
  }

  async inspectMarket(address) {
    const [first, second] = await Promise.all([this.rpc.getBlock('finalized'), this.backup.getBlock('finalized')]);
    if (!first || !second) throw new Error('Finalized block unavailable');
    const block = await this.block(Math.min(first.number, second.number));
    const factory = (method, args) => this.agreed(this.factory, FACTORY_ABI, method, args, block.number);
    if (!await factory('isMarket', [address])) throw new Error('Only official factory markets can be inspected');
    const [record, token, protocol, phase] = await Promise.all([
      factory('marketRecord', [address]), factory('marketCollateral', [address]), factory('protocol', []),
      this.agreed(address, MARKET_ABI, 'phase', [], block.number),
    ]);
    const creation = await this.lastBefore(Number(record.createdAt), block.number);
    const ledger = await this.marketLedger({
      address, firstBlock: creation.number + 1, throughBlock: block.number, creator: record.creator, protocol,
    });
    return { address, token, blockNumber: block.number, phase, ...ledger };
  }

  async snapshot(cutoff, fundingBefore, reports = []) {
    const { prior: previous, current: cutoffBlock } = await this.roundBounds(cutoff);
    const fundingBlock = fundingBefore === cutoff ? cutoffBlock
      : await this.lastBefore(fundingBefore, await this.confirmedHead(fundingBefore));
    const reviewEndsAt = cutoff + REVIEW;
    const markets = [];
    const trades = [];
    const prizes = [];
    const tokens = [];
    const weights = new Map();
    const totals = new Map();
    const reportLogs = [];
    for (const hash of reports) reportLogs.push(...(await this.receipt(hash)).logs);

    if (cutoffBlock.number >= this.factoryBlock) {
      const factory = (method, args, blockTag) => this.agreed(this.factory, FACTORY_ABI, method, args, blockTag);
      const count = await factory('marketCount', [], cutoffBlock.number);
      const priorCount = previous.number >= this.factoryBlock ? await factory('marketCount', [], previous.number) : 0n;
      const protocol = await factory('protocol', [], cutoffBlock.number);

      for (let index = 0n; index < count; index++) {
        const address = await factory('markets', [index], cutoffBlock.number);
        const phase = phaseNames[Number(await this.agreed(address, MARKET_ABI, 'phase', [], cutoffBlock.number))];
        if (!phase) continue;
        if (index < priorCount && phaseNames[Number(await this.agreed(address, MARKET_ABI, 'phase', [], previous.number))]) continue;

        const [record, token] = await Promise.all([
          factory('marketRecord', [address], cutoffBlock.number),
          factory('marketCollateral', [address], cutoffBlock.number),
        ]);
        const first = await this.lastBefore(Number(record.createdAt), cutoffBlock.number);
        const lifecycle = await this.logs(address, lifecycleTopics,
          Math.max(previous.number + 1, first.number + 1, this.factoryBlock), cutoffBlock.number);
        const terminal = lifecycle.map(parse).find(({ name, args }) =>
          phase === 'SETTLED' ? name === 'Finalized' : name === 'Closed' && Number(args.phase) === 4);
        if (!terminal || token === ZeroAddress) throw new Error(`Missing canonical terminal event or collateral for ${address}`);
        const terminalBlock = await this.block(terminal.blockNumber);
        const { claimedTrades, paidTradeFees, accruedTradeFees } = await this.marketLedger({
          address, firstBlock: first.number + 1, throughBlock: fundingBlock.number,
          reportLogs: reportLogs.filter((log) => log.blockNumber <= terminal.blockNumber),
          creator: record.creator, protocol,
        });
        if (claimedTrades.some((trade) => trade.blockNumber > terminal.blockNumber
          || (trade.blockNumber === terminal.blockNumber && trade.logIndex > terminal.logIndex))) {
          throw new Error(`Trade after terminal event for ${address}`);
        }

        markets.push({ address, token, finalizedAt: terminalBlock.timestamp, outcome: phase, terminalTransaction: terminal.transactionHash,
          accruedFees: accruedTradeFees.toString(), paidFees: paidTradeFees.toString() });
        if (paidTradeFees > 0n) totals.set(token, (totals.get(token) ?? 0n) + paidTradeFees);
        for (const entry of claimedTrades) {
          trades.push({ transactionHash: entry.transactionHash, logIndex: entry.logIndex, blockNumber: entry.blockNumber,
            market: address, wallet: entry.wallet, token, fee: entry.fee.toString(), paid: entry.paid });
        }
      }

      for (const [token, amount] of [...totals].sort(([a], [b]) => compareAddresses(a, b))) {
        const config = await factory('stocks', [token], cutoffBlock.number);
        const oracle = await this.agreed(config.priceOracle, ORACLE_ABI, 'stockUsd', [], cutoffBlock.number);
        const price = await this.agreed(oracle, FEED_ABI, 'latestRoundData', [], cutoffBlock.number);
        const decimals = Number(config.decimals);
        const quoteDecimals = Number(await this.agreed(oracle, FEED_ABI, 'decimals', [], cutoffBlock.number));
        if (decimals < 6 || decimals > 18 || quoteDecimals < 0 || quoteDecimals > 18 || price.round === 0n
          || price.answered < price.round || price.answer <= 0n || price.start === 0n || price.updated < price.start
          || price.updated > BigInt(cutoffBlock.timestamp) || BigInt(cutoff) - price.updated > BigInt(this.maxPriceAge)) {
          throw new Error(`Invalid or stale cutoff price for ${token}`);
        }
        const priceWad = price.answer * 10n ** BigInt(18 - quoteDecimals);
        // 符号只用于展示，资产始终按合约地址区分。
        const symbol = await this.agreed(token, ['function symbol() view returns (string)'], 'symbol', [], cutoffBlock.number);
        tokens.push({ token, symbol, decimals, priceWad: priceWad.toString(), oracle,
          oracleRound: price.round.toString(), priceUpdatedAt: Number(price.updated) });
        prizes.push({ token, amount: amount.toString() });
        for (const trade of trades) {
          if (trade.token !== token || !trade.paid) continue;
          const row = weights.get(trade.wallet) ?? { address: trade.wallet, weight: 0n, fees: new Map() };
          row.weight += usdWeight(trade.fee, priceWad, decimals);
          row.fees.set(token, (row.fees.get(token) ?? 0n) + BigInt(trade.fee));
          weights.set(trade.wallet, row);
        }
      }
    }

    const wallets = [...weights.values()].sort((a, b) => compareAddresses(a.address, b.address)).map(({ address, weight, fees }) =>
      ({ address, weight: weight.toString(), fees: [...fees].map(([token, amount]) => ({ token, amount: amount.toString() })) }));
    const root = tree(cutoff, wallets);
    const pendingFeeMarkets = markets.filter((market) => market.accruedFees !== market.paidFees).map(({ address }) => address);
    return {
      round: cutoff, reviewEndsAt, cutoffBlock: cutoffBlock.number, cutoffBlockHash: cutoffBlock.hash,
      fundingBlock: fundingBlock.number, fundingBlockHash: fundingBlock.hash, weightDecimals: 36,
      factory: this.factory, chainId: 4663, root: root.hash, totalWeight: root.weight.toString(),
      wallets, prizes, tokens, markets, trades, pendingFeeMarkets, reports: [...reports].sort(),
    };
  }
}
