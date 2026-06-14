const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const SETTLEMENT_KEYWORDS = ['paid back', 'pay back', 'settled', 'settlement', 'returning', 'returned', 'transfer']
const USD_RATE = 83.45

function parseAmount(raw) {
  if (!raw) return null
  const cleaned = String(raw).replace(/[₹$,\s]/g, '')
  const val = parseFloat(cleaned)
  return isNaN(val) ? null : val
}

function detectCurrency(raw) {
  const s = String(raw || '')
  if (s.includes('$')) return 'USD'
  if (s.includes('₹')) return 'INR'
  return null
}

function parseDate(raw) {
  if (!raw) return null
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

function looksLikeSettlement(desc) {
  const lower = (desc || '').toLowerCase()
  return SETTLEMENT_KEYWORDS.some(k => lower.includes(k))
}

function isDuplicate(row, existing) {
  return existing.some(e => {
    const sameDesc = e.description.toLowerCase().trim() === (row.description || '').toLowerCase().trim()
    const sameDate = e.date && row.parsedDate &&
      new Date(e.date).toDateString() === row.parsedDate.toDateString()
    const similarAmt = Math.abs(e.amountInINR - (row.amountInINR || 0)) < 300
    return sameDesc && sameDate && similarAmt
  })
}

async function importCSV(rows, groupId, batchId) {
  const anomalies = []
  const imported  = []

  const members = await prisma.groupMember.findMany({
    where: { groupId },
    include: { user: true }
  })

  const existing = await prisma.expense.findMany({ where: { groupId } })

  for (let i = 0; i < rows.length; i++) {
    const row    = rows[i]
    const rowNum = i + 1
    const issues = []
    let action   = 'IMPORT'
    let skip     = false

    if (!row.description && !row.amount && !row.date) continue

    if (!row.description) {
      anomalies.push({ importBatch: batchId, rowNumber: rowNum, rawData: JSON.stringify(row), issue: 'Missing description', action: 'SKIPPED' })
      continue
    }

    const rawAmount  = row.amount || row.Amount || row.AMOUNT
    const parsedAmt  = parseAmount(rawAmount)
    const detectedCur = detectCurrency(rawAmount)

    if (parsedAmt === null) {
      anomalies.push({ importBatch: batchId, rowNumber: rowNum, rawData: JSON.stringify(row), issue: `Unparseable amount: "${rawAmount}"`, action: 'SKIPPED' })
      continue
    }

    const rawDate   = row.date || row.Date || row.DATE
    const parsedDate = parseDate(rawDate)

    if (!parsedDate) {
      anomalies.push({ importBatch: batchId, rowNumber: rowNum, rawData: JSON.stringify(row), issue: `Invalid date: "${rawDate}"`, action: 'SKIPPED' })
      continue
    }

    row.parsedDate = parsedDate

    let currency    = detectedCur || (row.currency || row.Currency || 'INR').toUpperCase()
    let amountInINR = parsedAmt

    if (currency === 'USD') {
      amountInINR = Math.round(parsedAmt * USD_RATE * 100) / 100
      issues.push(`USD detected: $${parsedAmt} → ₹${amountInINR} at ₹${USD_RATE}/USD`)
      action = 'AUTO_FIXED'
    }

    row.amountInINR = amountInINR

    let isRefund = false
    if (parsedAmt < 0) {
      isRefund = true
      issues.push(`Negative amount treated as refund`)
      action = 'AUTO_FIXED'
    }

    if (looksLikeSettlement(row.description)) {
      anomalies.push({ importBatch: batchId, rowNumber: rowNum, rawData: JSON.stringify(row), issue: `Settlement keyword in: "${row.description}" — reclassified, not added as expense`, action: 'AUTO_FIXED' })
      continue
    }

    const paidByRaw  = row.paid_by || row.paidBy || row.PaidBy || row['Paid By'] || ''
    const memberMatch = members.find(m =>
      m.user.name.toLowerCase().trim() === paidByRaw.toLowerCase().trim()
    )

    if (!memberMatch) {
      anomalies.push({ importBatch: batchId, rowNumber: rowNum, rawData: JSON.stringify(row), issue: `Unknown member: "${paidByRaw}"`, action: 'SKIPPED' })
      continue
    }

    if (memberMatch.leftAt && parsedDate > new Date(memberMatch.leftAt)) {
      anomalies.push({ importBatch: batchId, rowNumber: rowNum, rawData: JSON.stringify(row), issue: `${memberMatch.user.name} had left by ${parsedDate.toDateString()} (left: ${new Date(memberMatch.leftAt).toDateString()})`, action: 'QUARANTINED' })
      continue
    }

    if (isDuplicate(row, existing)) {
      anomalies.push({ importBatch: batchId, rowNumber: rowNum, rawData: JSON.stringify(row), issue: `Possible duplicate: "${row.description}" on ${parsedDate.toDateString()} ≈ ₹${amountInINR}`, action: 'SKIPPED' })
      continue
    }

    const activeOnDate = members.filter(m => {
      const joined = new Date(m.joinedAt)
      const left   = m.leftAt ? new Date(m.leftAt) : null
      return joined <= parsedDate && (!left || left >= parsedDate)
    })

    if (!activeOnDate.length) {
      anomalies.push({ importBatch: batchId, rowNumber: rowNum, rawData: JSON.stringify(row), issue: `No active members on ${parsedDate.toDateString()}`, action: 'SKIPPED' })
      continue
    }

    const rawSplitType = (row.split_type || row.splitType || row.SplitType || 'EQUAL').toUpperCase()
    const validTypes   = ['EQUAL', 'EXACT', 'PERCENT', 'SHARE']
    const splitType    = validTypes.includes(rawSplitType) ? rawSplitType : 'EQUAL'

    if (!validTypes.includes(rawSplitType)) {
      issues.push(`Unknown split type "${rawSplitType}" — defaulted to EQUAL`)
      action = 'AUTO_FIXED'
    }

    const splitAmt = Math.round((Math.abs(amountInINR) / activeOnDate.length) * 100) / 100
    const splits   = activeOnDate.map(m => ({ userId: m.userId, amount: splitAmt }))

    const expense = await prisma.expense.create({
      data: {
        groupId,
        description: row.description,
        amount:      Math.abs(parsedAmt),
        currency,
        amountInINR: Math.abs(amountInINR),
        date:        parsedDate,
        paidById:    memberMatch.userId,
        splitType,
        importFlag:  issues.length ? issues.join(' | ') : null,
        splits:      { create: splits }
      }
    })

    imported.push(expense)
    existing.push({ ...expense, splits })

    if (issues.length) {
      anomalies.push({ importBatch: batchId, rowNumber: rowNum, rawData: JSON.stringify(row), issue: issues.join(' | '), action })
    }
  }

  if (anomalies.length) {
    await prisma.importAnomaly.createMany({ data: anomalies })
  }

  return { imported: imported.length, total: rows.length, anomalies }
}

module.exports = { importCSV }
