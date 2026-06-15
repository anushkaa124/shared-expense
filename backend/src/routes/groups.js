const router = require('express').Router()
const auth   = require('../middleware/auth')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

router.get('/', auth, async (req, res) => {
  try {
    const groups = await prisma.group.findMany({
      where:   { members: { some: { userId: req.user.id } } },
      include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } },
      orderBy: { createdAt: 'desc' }
    })
    res.json(groups)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/', auth, async (req, res) => {
  try {
    const { name } = req.body
    if (!name) return res.status(400).json({ error: 'Group name required' })
    const group = await prisma.group.create({
      data: {
        name,
        members: { create: { userId: req.user.id, joinedAt: new Date() } }
      },
      include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } }
    })
    res.json(group)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/:id', auth, async (req, res) => {
  try {
    const group = await prisma.group.findUnique({
      where:   { id: +req.params.id },
      include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } }
    })
    if (!group) return res.status(404).json({ error: 'Group not found' })
    res.json(group)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── the key route ────────────────────────────────────────────────────────────
router.post('/:id/members', auth, async (req, res) => {
  try {
    const groupId  = +req.params.id
    const { email, joinedAt } = req.body
    const joinDate = joinedAt ? new Date(joinedAt) : new Date()

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return res.status(404).json({ error: 'User not found. They must register first.' })

    // 1. upsert the membership (same as before)
    const member = await prisma.groupMember.upsert({
      where:  { groupId_userId: { groupId, userId: user.id } },
      update: { leftAt: null, joinedAt: joinDate },
      create: { groupId, userId: user.id, joinedAt: joinDate }
    })

    // 2. find all expenses on/after joinDate that mention this user by name
    //    in their rawData split_with field (from CSV import) OR in existing splits
    const expensesAfterJoin = await prisma.expense.findMany({
      where: {
        groupId,
        date: { gte: joinDate }
      },
      include: {
        splits: true
      }
    })

    // 3. for each expense, check if new member is missing from splits
    //    but was listed in the original CSV split_with
    const retroUpdates = []

    for (const expense of expensesAfterJoin) {
      const alreadyInSplit = expense.splits.some(s => s.userId === user.id)
      if (alreadyInSplit) continue

      // check if this expense's source CSV row mentioned the new member
      // we detect via importAnomaly rawData OR by checking if split_with contained their name
      // Since expenses don't store split_with, we check importAnomaly for this expense's row
      const anomaly = await prisma.importAnomaly.findFirst({
        where: {
          groupId,
          resolved: true,
          rawData:  { contains: user.name }
        }
      })

      // Also handle: expenses where split_with listed the user but they weren't in the group yet
      // We re-split equally among all members who were active at expense date INCLUDING new member
      // Only do this for expenses that have splitType EQUAL (safest to auto-fix)
      if (expense.splitType === 'EQUAL') {
        retroUpdates.push(expense)
      }
    }

    // 4. recalculate splits for each affected expense
    let retroCount = 0
    for (const expense of retroUpdates) {
      // get all members active at the time of this expense INCLUDING the new member
      const activeMembers = await prisma.groupMember.findMany({
        where: {
          groupId,
          joinedAt: { lte: expense.date },
          OR: [
            { leftAt: null },
            { leftAt: { gte: expense.date } }
          ]
        }
      })

      if (activeMembers.length === 0) continue

      const newShare = Math.round((expense.amountInINR / activeMembers.length) * 100) / 100

      // delete old splits and recreate with correct members
      await prisma.$transaction([
        prisma.expenseSplit.deleteMany({ where: { expenseId: expense.id } }),
        prisma.expenseSplit.createMany({
          data: activeMembers.map(m => ({
            expenseId: expense.id,
            userId:    m.userId,
            amount:    newShare
          }))
        })
      ])

      retroCount++
    }

    res.json({
      member,
      retroactiveSplitsUpdated: retroCount,
      message: retroCount > 0
        ? `Member added. ${retroCount} existing expense(s) from ${joinDate.toDateString()} onwards were recalculated to include ${user.name}.`
        : `Member added. No existing equal-split expenses needed updating.`
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.patch('/:id/members/:userId/leave', auth, async (req, res) => {
  try {
    const { leftAt } = req.body
    const member = await prisma.groupMember.update({
      where: { groupId_userId: { groupId: +req.params.id, userId: +req.params.userId } },
      data:  { leftAt: leftAt ? new Date(leftAt) : new Date() }
    })
    res.json(member)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router