const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function calculateBalances(groupId) {
  const expenses = await prisma.expense.findMany({
    where: { groupId, isSettlement: false },
    include: {
      splits: true,
      paidBy: { select: { id: true, name: true } }
    }
  })

  const settlements = await prisma.settlement.findMany({
    where: { groupId },
    include: {
      payer: { select: { id: true, name: true } },
      receiver: { select: { id: true, name: true } }
    }
  })

  const net = {}

  for (const exp of expenses) {
    const payer = exp.paidById
    if (!net[payer]) net[payer] = 0
    net[payer] += exp.amountInINR
    for (const split of exp.splits) {
      if (!net[split.userId]) net[split.userId] = 0
      net[split.userId] -= split.amount
    }
  }

  for (const s of settlements) {
    if (!net[s.payerId])   net[s.payerId]   = 0
    if (!net[s.receiverId]) net[s.receiverId] = 0
    net[s.payerId]   += s.amount
    net[s.receiverId] -= s.amount
  }

  const creditors = []
  const debtors   = []

  for (const [userId, bal] of Object.entries(net)) {
    const rounded = Math.round(bal * 100) / 100
    if (rounded > 0.01)  creditors.push({ userId: +userId, amount: rounded })
    if (rounded < -0.01) debtors.push({ userId: +userId, amount: -rounded })
  }

  creditors.sort((a, b) => b.amount - a.amount)
  debtors.sort((a, b) => b.amount - a.amount)

  const transactions = []
  let i = 0, j = 0

  while (i < creditors.length && j < debtors.length) {
    const amt = Math.min(creditors[i].amount, debtors[j].amount)
    const rounded = Math.round(amt * 100) / 100
    if (rounded > 0.01) {
      transactions.push({
        from:   debtors[j].userId,
        to:     creditors[i].userId,
        amount: rounded
      })
    }
    creditors[i].amount -= amt
    debtors[j].amount   -= amt
    if (creditors[i].amount < 0.01) i++
    if (debtors[j].amount   < 0.01) j++
  }

  return { net, transactions }
}

module.exports = { calculateBalances }
