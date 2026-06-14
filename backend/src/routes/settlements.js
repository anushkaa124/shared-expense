const router = require('express').Router()
const auth = require('../middleware/auth')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

router.get('/group/:groupId', auth, async (req, res) => {
  try {
    const settlements = await prisma.settlement.findMany({
      where: { groupId: +req.params.groupId },
      include: {
        payer:    { select: { id: true, name: true } },
        receiver: { select: { id: true, name: true } }
      },
      orderBy: { date: 'desc' }
    })
    res.json(settlements)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/', auth, async (req, res) => {
  try {
    const { groupId, payerId, receiverId, amount, date, note } = req.body
    if (!groupId || !payerId || !receiverId || !amount || !date)
      return res.status(400).json({ error: 'Missing required fields' })
    const settlement = await prisma.settlement.create({
      data: {
        groupId:    +groupId,
        payerId:    +payerId,
        receiverId: +receiverId,
        amount:     +amount,
        date:       new Date(date),
        note:       note || null
      },
      include: {
        payer:    { select: { id: true, name: true } },
        receiver: { select: { id: true, name: true } }
      }
    })
    res.json(settlement)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
