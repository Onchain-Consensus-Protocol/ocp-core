#!/usr/bin/env python3
"""Isolated accounting/math reference. Does not import or modify production, use RPC, or sign transactions."""
from decimal import Decimal, getcontext
from hashlib import sha256
from math import isqrt
from pathlib import Path
import csv
import json

getcontext().prec = 90
D = Decimal
ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
MICRO = 10**6
WAD = 10**18
SCALE = 10**12
CURVE_SCALE = 10**36 * SCALE
K = WAD


def quote_withdraw(gross, carry=0):
    fee = gross // 100 + (gross % 100 + carry) // 100
    return gross - fee, fee, (gross % 100 + carry) % 100


def current_boundary():
    # Same four pure buys as TopicMarketEconomicExamples.t.sol; freeze the last
    # transaction AFTER crediting R/B/shares and BEFORE the atomic _graduate().
    payments = [10000 * MICRO, 10000 * MICRO, 5666666667, 1000 * MICRO]
    accounts = ['early', 'middle', 'late', 'last_trigger']
    supply = reserve = b = 0
    holdings = []
    for name, paid in zip(accounts, payments):
        net = paid * 945 // 1000
        contribution = paid * 45 // 1000
        creator = paid // 100
        next_supply = isqrt((reserve + net) * CURVE_SCALE // K)
        holdings.append(dict(account=name, paid=paid, shares=next_supply-supply, contribution=contribution))
        supply = next_supply
        reserve += net
        b += contribution
        assert net + contribution + creator + (paid-net-contribution-creator) == paid
    rows = []
    for holder in holdings:
        for numerator, denominator in [(1, 100), (1, 10), (1, 2), (1, 1)]:
            quantity = holder['shares'] * numerator // denominator
            gross_sell = K * (supply*supply-(supply-quantity)**2) // CURVE_SCALE
            before_withdraw = gross_sell * 945 // 1000
            pre_net, _, _ = quote_withdraw(before_withdraw)
            lp_nav = reserve * quantity // supply
            hypothetical_lp_net, _, _ = quote_withdraw(lp_nav)
            rows.append(dict(account=holder['account'], holding_fraction=f'{numerator}/{denominator}',
                quantity_raw=str(quantity), fraction_of_supply=str(D(quantity)/D(supply)),
                pre_curve_gross_raw=gross_sell, pre_existing_sell_fee_net_raw=before_withdraw,
                pre_sell_user_net_raw=pre_net, post_initial_lp_nav_raw=lp_nav,
                hypothetical_lp_nav_redemption_user_net_raw=hypothetical_lp_net,
                post_executable_exit='LP_LOCKED',
                hypothetical_nav_vs_pre_net_ratio=str(D(hypothetical_lp_net)/D(pre_net))))
            assert hypothetical_lp_net < pre_net
    last = holdings[-1]
    lp_value = reserve * last['shares'] // supply
    terminal_gross = lp_value + last['contribution']
    terminal_net, _, _ = quote_withdraw(terminal_gross)
    assert abs(terminal_gross - 522014743) <= 3
    return dict(precision='USDC6 reference only', payments_raw=payments,
        reserve_raw=reserve, b_raw=b, supply_raw=str(supply), holdings=holdings, rows=rows,
        last_buyer=dict(paid_raw=last['paid'], lp_initial_nav_raw=lp_value,
            b_nominal_contribution_raw=last['contribution'],
            lp_plus_b_no_trade_terminal_gross_raw=terminal_gross,
            lp_plus_b_no_trade_terminal_net_raw=terminal_net))


def lmsr_increment(y, n, depth):
    hi = max(y, n)
    return hi + depth * ((D(1) + (-(abs(y-n))/depth).exp()).ln() - D(2).ln())


def disjoint_reserves(boundary):
    # Construction, not production: launch curve keeps R; a separate result market
    # receives only B as genuine first-loss capital, never promises to refund B par.
    launch_r = D(boundary['reserve_raw'])/MICRO
    capital = D(boundary['b_raw'])/MICRO
    depth = capital / D(2).ln()
    rows = []
    for y_mult, n_mult in [(0,0), (1,0), (0,1), (1,1), (3,1), (1,3), (20,0), (0,20), (20,20)]:
        y, n = depth*y_mult, depth*n_mult
        paid = lmsr_increment(y,n,depth)
        result_funds = capital + paid
        for outcome, payout in [('YES',y), ('NO',n), ('INVALID',(y+n)/2)]:
            residual = result_funds-payout
            assert residual >= 0
            # Curve reserve paid once, result liability paid once, B receives only residual.
            assert abs((launch_r+payout+residual)-(launch_r+result_funds)) < D('1e-75')
            rows.append(dict(y_multiple=y_mult,n_multiple=n_mult,outcome=outcome,
                launch_reserve=str(launch_r), result_initial_capital=str(capital),
                depth=str(depth), result_trader_net_payments=str(paid),
                result_funds=str(result_funds), outcome_liability=str(payout),
                b_residual=str(residual)))
    # Existing Formal has inventory limit M and b=M. Its required worst-case
    # subsidy is smaller than unbounded b*ln(2), but still much larger than B.
    m = launch_r
    old_depth_loss_at_inventory_limit = m-lmsr_increment(m,D(0),m)
    return dict(construction='launch curve R and result first-loss B never double-pledged',
        launch_reserve=str(launch_r), result_capital=str(capital),
        feasible_result_depth=str(depth), existing_formal_depth=str(m),
        existing_unbounded_subsidy=str(m*D(2).ln()),
        existing_limited_inventory_subsidy=str(old_depth_loss_at_inventory_limit),
        shortfall_if_keep_existing_depth=str(old_depth_loss_at_inventory_limit-capital), rows=rows)


def label_only_continuity(boundary):
    supply = int(boundary['supply_raw'])
    tested = 0
    for numerator in range(1,10001):
        quantity = supply*numerator//10000
        gross = K*(supply*supply-(supply-quantity)**2)//CURVE_SCALE
        paid = gross*945//1000
        for carry in range(100):
            # One function and one persistent state; the label is not an input.
            before = quote_withdraw(paid,carry)
            after = quote_withdraw(paid,carry)
            assert before == after
            tested += 1
    return dict(quantity_grid=10000, withdrawal_carry_cases=100, exact_comparisons=tested,
        explanation='Identity check of the unchanged reserve function; not an implementation test.')


def main():
    current = current_boundary()
    candidate = disjoint_reserves(current)
    continuity = label_only_continuity(current)
    # Serialize bigint token amounts as strings where JSON number precision would be unsafe.
    for holder in current['holdings']:
        holder['shares'] = str(holder['shares'])
    fingerprints = {}
    for relative in ['contracts/topic-market/src/TopicMarket.sol',
                     'contracts/topic-market/src/TopicMarketMath.sol',
                     'contracts/topic-market/test/TopicMarketEconomicExamples.t.sol']:
        fingerprints[relative] = sha256((ROOT/relative).read_bytes()).hexdigest()
    result = dict(scope='isolated reference, no RPC/no deployment/no production edits',
        source_sha256=fingerprints, current_boundary=current,
        disjoint_reserve_construction=candidate, label_only_continuity=continuity)
    (OUT/'graduation-settlement-reference.json').write_text(json.dumps(result,indent=2)+'\n')
    with (OUT/'graduation-settlement-boundary.csv').open('w',newline='') as stream:
        writer=csv.DictWriter(stream,fieldnames=list(current['rows'][0]))
        writer.writeheader();writer.writerows(current['rows'])
    print(json.dumps(dict(last_buyer=current['last_buyer'],
        reserve=current['reserve_raw']/MICRO, b=current['b_raw']/MICRO,
        feasible_result_depth=candidate['feasible_result_depth'],
        existing_limited_inventory_subsidy=candidate['existing_limited_inventory_subsidy'],
        shortfall_if_keep_existing_depth=candidate['shortfall_if_keep_existing_depth'],
        continuity=continuity),indent=2))


if __name__ == '__main__':
    main()
