import { AbiCoder, ZeroHash, keccak256 } from 'ethers';

export const WEEK = 7 * 86400;
export const REVIEW = 12 * 3600;
const FIRST_SUNDAY_NOON = 3 * 86400 + REVIEW;
const coder = AbiCoder.defaultAbiCoder();

export function compareAddresses(a, b) {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return left < right ? -1 : Number(left > right);
}

export function weeklyCutoff(seconds) {
  return FIRST_SUNDAY_NOON + Math.floor((seconds - FIRST_SUNDAY_NOON) / WEEK) * WEEK;
}

export function isCutoff(seconds) {
  return Number.isSafeInteger(seconds) && seconds > 0 && weeklyCutoff(seconds) === seconds;
}

export function tradeFee(base) {
  return BigInt(base) * 3n / 1000n;
}

export function usdWeight(amount, priceWad, tokenDecimals) {
  return BigInt(amount) * BigInt(priceWad) * 10n ** BigInt(18 - tokenDecimals);
}

export function tree(cutoff, entries) {
  const leaves = entries.filter(({ weight }) => BigInt(weight) > 0n)
    .sort((left, right) => compareAddresses(left.address, right.address))
    .map(({ address, weight }) => ({
      address,
      weight: BigInt(weight),
      hash: keccak256(coder.encode(['uint64', 'address', 'uint256'], [cutoff, address, weight])),
    }));

  let nodes = leaves;
  while (nodes.length > 1) {
    const parents = [];
    for (let index = 0; index < nodes.length; index += 2) {
      const [left, right] = nodes.slice(index, index + 2);
      parents.push(right ? {
        left,
        right,
        weight: left.weight + right.weight,
        hash: keccak256(coder.encode(
          ['bytes32', 'uint256', 'bytes32', 'uint256'],
          [left.hash, left.weight, right.hash, right.weight],
        )),
      } : left);
    }
    nodes = parents;
  }

  return nodes[0] ?? { hash: ZeroHash, weight: 0n };
}

export function winnerProof(root, index) {
  if (index < 0n || index >= root.weight) throw new Error('Draw index outside tree');
  const siblings = [];
  let node = root;
  let offset = index;
  while (node.left) {
    const right = offset >= node.left.weight;
    siblings.push({ node: right ? node.left : node.right, onLeft: right });
    if (right) offset -= node.left.weight;
    node = right ? node.right : node.left;
  }
  siblings.reverse();
  return {
    address: node.address,
    weight: node.weight,
    siblingHashes: siblings.map(({ node }) => node.hash),
    siblingWeights: siblings.map(({ node }) => node.weight),
    siblingOnLeft: siblings.map(({ onLeft }) => onLeft),
  };
}

export function replayFees(logs, { creator, protocol }) {
  const claimedTrades = [];
  const pending = { creator: 0n, protocol: 0n, dust: 0n };
  let paidTradeFees = 0n;
  let accruedTradeFees = 0n;
  let paidTradeCount = 0;
  let awaitingProtocol;

  for (const entry of logs) {
    const { name, args } = entry;
    if (awaitingProtocol && (name !== 'FeePayout' || awaitingProtocol !== entry.transactionHash)) {
      throw new Error('Protocol payout event missing');
    }
    if (name === 'GenesisTrade' || name === 'FormalTrade') {
      const fee = tradeFee(args.base);
      if (name === 'GenesisTrade') pending.creator += args.base * 7n / 1000n;
      pending.protocol += fee;
      accruedTradeFees += fee;
      if (fee > 0n) claimedTrades.push({ ...entry, wallet: args.user, fee });
      continue;
    }
    if (name === 'DustCollected') {
      pending.dust += args.amount;
      continue;
    }
    if (name !== 'FeePayout') continue;

    // 同一个地址可能同时是创建者和协议收款人。现有市场固定先发创建者事件，
    // 然后发协议费事件，所以按账面金额和顺序区分两个资金桶。
    if (!awaitingProtocol && pending.creator > 0n) {
      if (args.recipient !== creator || args.amount !== pending.creator) {
        throw new Error('Creator fee payout does not match accrued fees');
      }
      if (args.paid) pending.creator = 0n;
      if (pending.protocol + pending.dust > 0n) awaitingProtocol = entry.transactionHash;
      continue;
    }

    if (args.recipient !== protocol || args.amount === 0n || args.amount !== pending.protocol + pending.dust) {
      throw new Error('Protocol payout does not match accrued fees');
    }
    awaitingProtocol = undefined;
    if (args.paid) {
      paidTradeFees += pending.protocol;
      paidTradeCount = claimedTrades.length;
      pending.protocol = 0n;
      pending.dust = 0n;
    }
  }
  if (awaitingProtocol) throw new Error('Protocol payout event missing');

  return { claimedTrades: claimedTrades.map((trade, index) => ({ ...trade, paid: index < paidTradeCount })),
    paidTradeFees, accruedTradeFees, pendingProtocol: pending.protocol + pending.dust };
}
