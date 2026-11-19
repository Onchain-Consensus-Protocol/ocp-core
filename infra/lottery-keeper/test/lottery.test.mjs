import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AbiCoder, keccak256 } from 'ethers';
import { REVIEW, WEEK, weeklyCutoff, tradeFee, usdWeight, tree, winnerProof, replayFees } from '../src/lottery.mjs';

const addresses = Array.from({ length: 5 }, (_, i) => `0x${String(i + 1).padStart(40, '0')}`);
const [first, second, third, unsupportedUser, protocol] = addresses;
const transactionHash = (id) => `0x${String(id).padStart(64, '0')}`;
const row = (name, args, tx) => ({ name, args, transactionHash: transactionHash(tx) });
const payout = (recipient, amount, paid, tx) => row('FeePayout', { recipient, amount, paid }, tx);
const trade = (name, user, base, tx) => row(name, { user, base }, tx);

test('Shanghai Sunday 20:00 cutoff and 12 hour review are weekly and exact', () => {
  const cutoff = Date.parse('2026-11-22T12:00:00Z') / 1000;
  assert.equal(weeklyCutoff(cutoff - 1), cutoff - WEEK);
  assert.equal(weeklyCutoff(cutoff), cutoff);
  assert.equal(weeklyCutoff(cutoff + REVIEW), cutoff);
  assert.equal(weeklyCutoff(cutoff + WEEK), cutoff + WEEK);
});

test('fee and normalized integer weight match protocol rounding without a split bonus', () => {
  assert.equal(tradeFee(333n), 0n);
  assert.equal(tradeFee(334n), 1n);
  assert.equal(tradeFee(999n), 2n);
  assert.equal(tradeFee(350n) + tradeFee(649n), tradeFee(999n));
  assert.equal(usdWeight(10n, 40n * 10n ** 18n, 6), usdWeight(1n, 400n * 10n ** 18n, 6));
  assert.equal(usdWeight(13n, 3n * 10n ** 18n, 18) + usdWeight(12n, 3n * 10n ** 18n, 18),
    usdWeight(25n, 3n * 10n ** 18n, 18));
});

test('weighted proof picks the exact intervals and reconstructs the root for odd leaves', () => {
  const cutoff = Date.parse('2026-11-22T12:00:00Z') / 1000;
  const entries = [{ address: third, weight: '70' }, { address: first, weight: '10' }, { address: second, weight: '20' }];
  const root = tree(cutoff, entries);
  assert.equal(root.weight, 100n);
  assert.throws(() => winnerProof(root, 100n));
  for (const [index, winner] of [[0n, first], [9n, first], [10n, second], [29n, second], [30n, third], [99n, third]]) {
    const proof = winnerProof(root, index);
    assert.equal(proof.address, winner);
    const coder = AbiCoder.defaultAbiCoder();
    let branch = keccak256(coder.encode(['uint64', 'address', 'uint256'], [cutoff, proof.address, proof.weight]));
    let weight = proof.weight;
    let offset = 0n;
    for (const [i, sibling] of proof.siblingHashes.entries()) {
      const siblingWeight = proof.siblingWeights[i];
      const onLeft = proof.siblingOnLeft[i];
      branch = keccak256(coder.encode(['bytes32', 'uint256', 'bytes32', 'uint256'], onLeft
        ? [sibling, siblingWeight, branch, weight] : [branch, weight, sibling, siblingWeight]));
      if (onLeft) offset += siblingWeight;
      weight += siblingWeight;
    }
    assert.equal(branch, root.hash);
    assert.equal(weight, 100n);
    assert.ok(index >= offset && index < offset + proof.weight);
  }
});

test('fee attribution excludes creator fees, dust, unsuccessful payouts and later unpaid trades', () => {
  const logs = [
    trade('GenesisTrade', first, 1000n, 1),
    payout(protocol, 7n, true, 2),
    payout(protocol, 3n, false, 2),
    trade('FormalTrade', second, 2500n, 3),
    row('DustCollected', { amount: 50n }, 4),
    payout(protocol, 60n, true, 4),
    trade('FormalTrade', third, 2000n, 5),
    payout(protocol, 6n, false, 6),
  ];
  const result = replayFees(logs, { creator: protocol, protocol });
  assert.deepEqual(result.claimedTrades.map(({ wallet, fee, paid }) => ({ wallet, fee, paid })), [
    { wallet: first, fee: 3n, paid: true },
    { wallet: second, fee: 7n, paid: true },
    { wallet: third, fee: 6n, paid: false },
  ]);
  assert.equal(result.paidTradeFees, 10n);
  assert.equal(result.accruedTradeFees, 16n);
  assert.equal(result.pendingProtocol, 6n);
  assert.throws(() => replayFees([trade('GenesisTrade', unsupportedUser, 1000n, 1),
    payout(protocol, 7n, true, 2)], { creator: protocol, protocol }), /missing/i);
});
