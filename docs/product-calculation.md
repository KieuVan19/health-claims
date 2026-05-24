# Reimbursement Calculation

## The goal: how much does insurance pay?

You submit a bill. The system works through **three filters** in order. Each one reduces what insurance owes you.

---

## Filter 1 — Coverage cap

> "We only consider up to your plan's coverage limit."

```
eligibleAmount = min(yourBill, coverageLimit)
```

If your bill is **$12,000** but your plan only covers up to **$10,000**, the calculation works off $10,000 from here on. The extra $2,000 is simply your problem.

---

## Filter 2 — Deductible

> "You pay the first chunk of every year yourself."

The deductible is a fixed annual threshold. You pay 100% of your bills until you've hit it. After that, insurance starts helping.

```
deductibleApplied = min(eligibleAmount, remainingDeductible)
afterDeductible   = eligibleAmount - deductibleApplied
```

**Key word: remaining.** If your deductible is $250 and you've already paid $200 worth this year, only $50 more comes out of this claim — not the full $250.

| | Example |
|---|---|
| Bill | $1,000 |
| Deductible | $250 (not yet paid) |
| You pay first | $250 |
| Handed to copay step | $750 |

---

## Filter 3 — Copay

> "Even after the deductible, you still split the remaining bill with insurance."

Copay is a percentage you owe on whatever survived the deductible.

```
reimbursable = afterDeductible × (1 − copayPercent)
```

| | Example (Standard plan, 20% copay) |
|---|---|
| After deductible | $750 |
| Your share (20%) | $150 |
| Insurance pays (80%) | **$600** |

---

## The OOP cap — the safety net

> "No matter what, you never pay more than X in a year."

OOP (Out-of-Pocket Maximum) is the total limit on your personal spending per year. It counts **everything you've paid** — deductibles and copays across all your claims combined.

| Plan | OOP Max |
|---|---|
| Basic | $8,000 |
| Standard | $6,000 |
| Premium | $4,000 |

Once your running total hits that number, insurance pays **100%** for the rest of the year. Three scenarios:

**A — You haven't hit it yet** → normal calculation, deductible + copay both apply.

**B — This claim would push you over** → the system caps your cost-sharing so you land exactly at the OOP max, not beyond it. Deductible is charged first (priority), then copay takes whatever headroom is left.

```
actualDeductible = min(deductibleApplied, remainingOop)
actualCopay      = min(rawCopay, remainingOop − actualDeductible)
```

**C — You've already hit it** → deductible = $0, copay = $0, reimbursable = full eligible amount.

---

## Full worked example

**Patient on Standard plan** (deductible $250, copay 20%, OOP max $6,000).
They've already paid **$5,950** in cost-sharing this year. Now a **$1,000** claim arrives.

| Step | Calculation | Result |
|---|---|---|
| Coverage cap | min($1,000, $100,000) | **$1,000 eligible** |
| Remaining deductible | $250 − $0 paid = $250 | apply $250 |
| OOP headroom left | $6,000 − $5,950 = **$50** | |
| Deductible capped to headroom | min($250, $50) | **$50 deductible** |
| Copay headroom left | $50 − $50 = **$0** | **$0 copay** |
| Insurance pays | $1,000 − $50 − $0 | **$950 reimbursed** |

Patient hits the OOP ceiling exactly. Every claim after this: insurance pays 100%.

---

## The one-liner

```
reimbursable = eligibleAmount − actualDeductible − actualCopay
```

where `actualDeductible` and `actualCopay` are each capped so your total cost-sharing never exceeds `oopMax − what you've already paid this year`.
