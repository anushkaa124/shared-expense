const router = require('express').Router()
const auth = require('../middleware/auth')
const { PrismaClient } = require('@prisma/client')
const { calculateBalances } = require('../lib/balances')
const prisma = new PrismaClient()

router.get('/group/:groupId', auth, async (req, res) => {
  try {
    const expenses = await prisma.expense.findMany({
      where: { groupId: +req.params.groupId },
      include: {
        paidBy: { select: { id: true, name: true } },
        splits: {
          include: { user: { select: { id: true, name: true } } }
        }
      },
      orderBy: { date: 'desc' }
    })
    res.json(expenses)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/', auth, async (req, res) => {
  try {
    const {
      groupId, description, amount,
      currency = 'INR', amountInINR,
      date, paidById, splitType, splits
    } = req.body

    if (!groupId || !description || !amount || !date || !paidById || !splits?.length)
      return res.status(400).json({ error: 'Missing required fields' })

    const expense = await prisma.expense.create({
      data: {
        groupId:     +groupId,
        description,
        amount:      +amount,
        currency,
        amountInINR: +(amountInINR || amount),
        date:        new Date(date),
        paidById:    +paidById,
        splitType,
        splits:      { create: splits.map(s => ({ userId: +s.userId, amount: +s.amount })) }
      },
      include: {
        paidBy: { select: { id: true, name: true } },
        splits: { include: { user: { select: { id: true, name: true } } } }
      }
    })
    res.json(expense)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.delete('/:id', auth, async (req, res) => {
  try {
    await prisma.expenseSplit.deleteMany({ where: { expenseId: +req.params.id } })
    await prisma.expense.delete({ where: { id: +req.params.id } })
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/group/:groupId/balances', auth, async (req, res) => {
  try {
    const balances = await calculateBalances(+req.params.groupId)
    res.json(balances)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
