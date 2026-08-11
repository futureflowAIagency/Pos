import Installment from '../models/Installment.js';

// ---- EMI profit recognition -------------------------------------------------
// A phone bought for ৳28,000 and sold on EMI for ৳35,000 makes ৳7,000 — but that
// money arrives over months, not on the day the plan is signed. So the profit is
// recognised as the payments actually come in: every payment (the down payment
// included) carries its own share of the plan's profit, in proportion to how
// much of the plan it settles. A ৳4,000 instalment on a ৳35,000 plan with ৳7,000
// profit books 4000/35000 × 7000 = ৳800 of profit on the day it is collected.
//
// The plan's cost basis (`purchasePrice`) is snapshotted when the plan is
// created. Plans with no cost recorded recognise NOTHING rather than treating
// the whole sale price as profit — a missing cost is reported separately
// (`plansWithoutCost`) so it can be fixed instead of quietly inflating profit.

export function planProfitRate(plan) {
  const total = Number(plan.totalAmount) || 0;
  const cost = Number(plan.purchasePrice) || 0;
  if (total <= 0 || cost <= 0) return 0;
  return (total - cost) / total;
}

export function planTotalProfit(plan) {
  const total = Number(plan.totalAmount) || 0;
  const cost = Number(plan.purchasePrice) || 0;
  if (total <= 0 || cost <= 0) return 0;
  return Math.round((total - cost) * 100) / 100;
}

// Sum the profit (and the cash) recognised from a set of plans within a window.
export function recogniseEmiProfit(plans, from, to) {
  const f = from ? new Date(from).getTime() : -Infinity;
  const t = to ? new Date(to).getTime() : Infinity;
  const inRange = (d) => {
    if (!d) return false;
    const x = new Date(d).getTime();
    return x >= f && x <= t;
  };

  let profit = 0;
  let collected = 0;
  let payments = 0;
  let plansWithoutCost = 0;

  for (const plan of plans) {
    const rate = planProfitRate(plan);
    let planCollected = 0;

    // the down payment is taken the day the plan is created
    if (inRange(plan.createdAt)) planCollected += Number(plan.downPayment) || 0;
    if (inRange(plan.createdAt) && (Number(plan.downPayment) || 0) > 0) payments += 1;

    for (const s of plan.schedule || []) {
      if (s.paid && inRange(s.paidAt)) {
        planCollected += Number(s.amount) || 0;
        payments += 1;
      }
    }

    if (planCollected <= 0) continue;
    collected += planCollected;
    if (rate > 0) profit += planCollected * rate;
    else plansWithoutCost += 1; // money came in but we don't know what the item cost
  }

  return {
    profit: Math.round(profit * 100) / 100,
    collected: Math.round(collected * 100) / 100,
    payments,
    plansWithoutCost,
  };
}

// Every plan that could have recognised something in [from, to]: either it was
// created then (down payment) or one of its instalments was paid then.
export function findPlansInRange(match, from, to) {
  return Installment.find({
    ...match,
    $or: [
      { createdAt: { $gte: from, $lte: to } },
      { schedule: { $elemMatch: { paid: true, paidAt: { $gte: from, $lte: to } } } },
    ],
  });
}
