const router  = require('express').Router()
const auth    = require('../middleware/auth')
const multer  = require('multer')
const Papa    = require('papaparse')
const { importCSV } = require('../lib/csvImporter')
const { PrismaClient } = require('@prisma/client')
const prisma  = new PrismaClient()
const upload  = multer({ storage: multer.memoryStorage() })

router.post('/:groupId', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    const csv     = req.file.buffer.toString('utf8')
    const { data } = Papa.parse(csv, { header: true, skipEmptyLines: true })
    const batchId = `batch_${Date.now()}`
    const result  = await importCSV(data, +req.params.groupId, batchId)
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/anomalies/:groupId', auth, async (req, res) => {
  try {
    const anomalies = await prisma.importAnomaly.findMany({
      where: { resolved: false },
      orderBy: { createdAt: 'desc' }
    })
    res.json(anomalies)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.patch('/anomalies/:id/resolve', auth, async (req, res) => {
  try {
    const anomaly = await prisma.importAnomaly.update({
      where: { id: +req.params.id },
      data:  { resolved: true, resolvedBy: req.user.id }
    })
    res.json(anomaly)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
