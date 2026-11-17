#!/usr/bin/env python3
"""Independent reference for OCPCore's interval fee-history accounting.

Uses only Python's standard library. No RPC, credentials, transactions or files
are read. P=17 deliberately magnifies rounding, versus Solidity's P=10**30.

Correspondence to OCPCore:
* depositMarketFee: delta_index = floor(fee * P / current eligible principal).
* stake: checkpoint OLD principal before appending; a first zero-principal
  checkpoint also synchronizes all three indices.
* _feeGrowth/_checkpointMarketFees: retain each account's fractional remainder
  independently for YES, NO and INVALID ledgers.
* conditionalMarketFees: pending + the same interval-growth calculation.
* _claimSelectedMarketFees: pay the account's own integer reward, with no final
  claimant sweep. Any unallocated reward stays in the accounted reward pool.

The independent entitlement oracle sums each deposit's scaled entitlement using
the principal present at that deposit. Fraction also tracks the exact rational
fee entitlement BEFORE index rounding; actual rewards must not exceed it.

This is a mathematical reference/stress check, not EVM execution or a substitute
for Foundry tests. Principal payouts and the paused withdrawal levy are outside
its scope. Fixed precision may leave substantial unallocated fees at extreme
scales; this script proves neither exact distribution nor a universal dust bound.
"""

from fractions import Fraction
from random import Random


PRECISION = 17
TRACES = 5000
STEPS = 50
ACCOUNTS = 6
SEED = 20261029


def run():
    random = Random(SEED)
    for trace in range(TRACES):
        stake = [0] * ACCOUNTS
        sides = [random.randrange(3) for _ in range(ACCOUNTS)]
        indices = [0] * 3
        last = [[0] * 3 for _ in range(ACCOUNTS)]
        remainders = [[0] * 3 for _ in range(ACCOUNTS)]
        pending = [[0] * 3 for _ in range(ACCOUNTS)]
        encoded_entitlement = [[0] * 3 for _ in range(ACCOUNTS)]
        exact_entitlement = [
            [Fraction(0) for _ in range(3)] for _ in range(ACCOUNTS)
        ]
        distributed = [0] * 3

        def weight(user, ledger):
            eligible = sides[user] == ledger if ledger < 2 else sides[user] < 2
            return stake[user] if eligible else 0

        def checkpoint(user):
            for ledger in range(3):
                scaled = (
                    weight(user, ledger) * (indices[ledger] - last[user][ledger])
                    + remainders[user][ledger]
                )
                pending[user][ledger] += scaled // PRECISION
                remainders[user][ledger] = scaled % PRECISION
                last[user][ledger] = indices[ledger]

        for step in range(STEPS):
            action = random.randrange(3)
            user = random.randrange(ACCOUNTS)
            if action == 0:
                checkpoint(user)
                stake[user] += random.randrange(1, 80)
                # The checkpoint synchronizes the indices before the new stake
                # exists. Explicitly check this critical first-stake invariant.
                assert last[user] == indices, (trace, step, "stale stake index")
            elif action == 1:
                fee = random.randrange(1, 60)
                for ledger in range(3):
                    total = sum(weight(v, ledger) for v in range(ACCOUNTS))
                    if total:
                        delta = fee * PRECISION // total
                        indices[ledger] += delta
                        distributed[ledger] += fee
                        for v in range(ACCOUNTS):
                            encoded_entitlement[v][ledger] += weight(v, ledger) * delta
                            exact_entitlement[v][ledger] += Fraction(
                                weight(v, ledger) * fee, total
                            )
            else:
                checkpoint(user)

            # A view without a checkpoint must agree with the independent
            # deposit-by-deposit oracle, regardless of earlier checkpoints.
            for v in range(ACCOUNTS):
                for ledger in range(3):
                    uncheckpointed = (
                        weight(v, ledger) * (indices[ledger] - last[v][ledger])
                        + remainders[v][ledger]
                    ) // PRECISION
                    assert pending[v][ledger] + uncheckpointed == (
                        encoded_entitlement[v][ledger] // PRECISION
                    ), (trace, step, v, ledger, "history/conditional mismatch")

        for user in range(ACCOUNTS):
            checkpoint(user)

        for ledger in range(3):
            total_paid = sum(pending[u][ledger] for u in range(ACCOUNTS))
            assert total_paid <= distributed[ledger], (trace, ledger, "overpaid pool")
            for user in range(ACCOUNTS):
                assert pending[user][ledger] == encoded_entitlement[user][ledger] // PRECISION
                assert pending[user][ledger] <= exact_entitlement[user][ledger]
                assert remainders[user][ledger] == encoded_entitlement[user][ledger] % PRECISION

            for _ in range(3):
                order = list(range(ACCOUNTS))
                random.shuffle(order)
                pool = distributed[ledger]
                for user in order:
                    pool -= pending[user][ledger]
                    assert pool >= 0, (trace, ledger, order, "claim order overdraw")
                assert pool == distributed[ledger] - total_paid

    print("PASS: independent Core fee-history reference")
    print(f"seed={SEED}; precision={PRECISION} (intentionally low stress precision)")
    print(f"traces={TRACES}; actions_per_trace={STEPS}; accounts={ACCOUNTS}")
    print("ledgers=YES,NO,INVALID; actions=stake/append,fee,checkpoint")
    print("PASS: conditional views equal independent interval entitlement after every action")
    print("PASS: checkpoint partition preserves earned integer rewards and fractional remainders")
    print("PASS: new/added principal receives no historical index growth")
    print("PASS: every account reward <= exact rational deposit-time entitlement")
    print("PASS: aggregate rewards <= selected distributed fees in every ledger")
    print("PASS: three shuffled claim orders per outcome leave identical nonnegative reward dust")
    print("Scope: mathematical model only; no EVM/RPC run, no principal payout or withdrawal-levy validation")


if __name__ == "__main__":
    run()
