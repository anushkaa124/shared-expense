const router = require('express').Router()
const auth = require('../middleware/auth')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

router.get('/', auth, async (req, res) => {
  try {
    const groups = await prisma.group.findMany({
      where: {
        members: {
          some: { userId: req.user.id }
        }
      },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
    res.json(groups)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/', auth, async (req, res) => {
  try {
    const { name } = req.body
    if (!name) return res.status(400).json({ error: 'Group name required' })
    const group = await prisma.group.create({
      data: {
        name,
        members: {
          create: { userId: req.user.id, joinedAt: new Date() }
        }
      },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } }
        }
      }
    })
    res.json(group)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/:id', auth, async (req, res) => {
  try {
    const group = await prisma.group.findUnique({
      where: { id: +req.params.id },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } }
        }
      }
    })
    if (!group) return res.status(404).json({ error: 'Group not found' })
    res.json(group)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/:id/members', auth, async (req, res) => {
  try {
    const { email, joinedAt } = req.body
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return res.status(404).json({ error: 'User not found. They must register first.' })
    const member = await prisma.groupMember.upsert({
      where: {
        groupId_userId: { groupId: +req.params.id, userId: user.id }
      },
      update: { leftAt: null, joinedAt: joinedAt ? new Date(joinedAt) : new Date() },
      create: {
        groupId: +req.params.id,
        userId: user.id,
        joinedAt: joinedAt ? new Date(joinedAt) : new Date()
      }
    })
    res.json(member)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.patch('/:id/members/:userId/leave', auth, async (req, res) => {
  try {
    const { leftAt } = req.body
    const member = await prisma.groupMember.update({
      where: {
        groupId_userId: {
          groupId: +req.params.id,
          userId: +req.params.userId
        }
      },
      data: { leftAt: leftAt ? new Date(leftAt) : new Date() }
    })
    res.json(member)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
