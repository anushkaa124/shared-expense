const router  = require('express').Router()
const auth    = require('../middleware/auth')
const multer  = require('multer')
const Papa    = require('papaparse')
const { importCSV, importSingleRow } = require('../lib/csvImporter')
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

// ✅ Fix: filter by groupId so each group only sees its own anomalies
router.get('/anomalies/:groupId', auth, async (req, res) => {
  try {
    const anomalies = await prisma.importAnomaly.findMany({
      where: { resolved: false, groupId: +req.params.groupId },
      orderBy: { rowNumber: 'asc' }
    })
    res.json(anomalies)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ✅ Fix: actually create the expense when resolving (not just mark resolved)
router.patch('/anomalies/:id/resolve', auth, async (req, res) => {
  try {
    const { action, resolution } = req.body || {}

    const anomaly = await prisma.importAnomaly.findUnique({
      where: { id: +req.params.id }
    })
    if (!anomaly) return res.status(404).json({ error: 'Anomaly not found' })

    // Only attempt to create an expense if the user didn't skip/discard
    const shouldImport = action !== 'SKIP' && action !== 'DISCARD'

    if (shouldImport) {
  const raw = JSON.parse(anomaly.rawData)
  if (resolution?.date)      raw.date       = resolution.date
  if (resolution?.currency)  raw.currency   = resolution.currency
  if (resolution?.paid_by)   raw.paid_by    = resolution.paid_by
  if (resolution?.splitType) raw.split_type = resolution.splitType
  
  try {
    await importSingleRow(raw, anomaly.groupId)
  } catch (importErr) {
    // ✅ if it's a duplicate, still mark resolved but tell the frontend
    if (importErr.message.startsWith('DUPLICATE')) {
      const updated = await prisma.importAnomaly.update({
        where: { id: anomaly.id },
        data:  { resolved: true, resolvedBy: req.user.id, action: 'SKIPPED_DUPLICATE' }
      })
      return res.json({ ...updated, warning: importErr.message })
    }
    console.error(`importSingleRow failed for anomaly ${anomaly.id}:`, importErr.message)
  }
}
    const updated = await prisma.importAnomaly.update({
      where: { id: anomaly.id },
      data: {
        resolved:   true,
        resolvedBy: req.user.id,
        action:     action || 'RESOLVED'
      }
    })

    res.json(updated)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router