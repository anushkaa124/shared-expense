const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const USD_RATE = 83.45
const SETTLEMENT_KEYWORDS = ['paid back', 'pay back', 'settled', 'settlement', 'returning', 'returned', 'transfer', 'deposit share']

function parseAmount(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  const cleaned = String(raw).replace(/[₹$,\s]/g, '')
  const val = parseFloat(cleaned)
  return isNaN(val) ? null : val
}

function detectCurrency(rawAmount, rawCurrency) {
  if (String(rawAmount).includes('$')) return 'USD'
  const c = (rawCurrency || '').trim().toUpperCase()
  if (c === 'USD') return 'USD'
  if (c === 'INR') return 'INR'
  return null
}

function parseDate(raw) {
  if (!raw || !raw.trim()) return { date: null, issue: 'missing' }
  const s = raw.trim()

  // ISO format: 2026-02-01
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s)
    return isNaN(d) ? { date: null, issue: 'invalid' } : { date: d, issue: null }
  }

  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/')
    const ambiguous = parseInt(d) <= 12
    const date = new Date(`${y}-${m}-${d}`)
    return { date: isNaN(date) ? null : date, issue: ambiguous ? 'ambiguous_date_format' : null, raw: s }
  }

  // ✅ "Mar 14" or "Mar-14" — missing year (space OR hyphen between month and day)
  if (/^[A-Za-z]{3}[\s-]\d{1,2}$/.test(s)) {
    return { date: null, issue: 'missing_year', raw: s }
  }

  // ✅ "Mar-14-2026" or "Mar 14 2026" — month name with day and year
  if (/^[A-Za-z]{3}[\s-]\d{1,2}[\s-]\d{4}$/.test(s)) {
    const parts = s.split(/[\s-]/)
    const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 }
    const mon = months[parts[0].toLowerCase()]
    const day = parseInt(parts[1])
    const yr  = parseInt(parts[2])
    if (!mon) return { date: null, issue: 'invalid' }
    const date = new Date(`${yr}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`)
    return isNaN(date) ? { date: null, issue: 'invalid' } : { date, issue: null }
  }

  return { date: null, issue: 'invalid' }
}

function normaliseName(name) {
  return (name || '').trim().toLowerCase()
}

function findMember(members, name) {
  const n = normaliseName(name)
  let m = members.find(m => normaliseName(m.user.name) === n)
  if (m) return { member: m, issue: null }
  m = members.find(m => normaliseName(m.user.name.split(' ')[0]) === n.split(' ')[0])
  if (m) return { member: m, issue: 'name_casing', matched: m.user.name }
  return { member: null, issue: 'unknown_member' }
}

function parseSplitWith(raw) {
  if (!raw) return []
  return raw.split(';').map(s => s.trim()).filter(Boolean)
}

function parseSplitDetails(raw, splitType) {
  if (!raw || !raw.trim()) return null
  const entries = {}
  const parts = raw.split(';').map(s => s.trim()).filter(Boolean)
  for (const part of parts) {
    const match = part.match(/^(.+?)\s+([\d.]+)%?$/)
    if (match) entries[match[1].trim()] = parseFloat(match[2])
  }
  return Object.keys(entries).length ? entries : null
}

function checkPercentagesSum(details) {
  if (!details) return true
  const total = Object.values(details).reduce((s, v) => s + v, 0)
  return Math.abs(total - 100) < 0.01
}

function looksLikeSettlement(description, notes) {
  const text = ((description || '') + ' ' + (notes || '')).toLowerCase()
  return SETTLEMENT_KEYWORDS.some(k => text.includes(k))
}

// ─── replace normaliseDesc and isDuplicate in csvImporter.js ─────────────────

function normaliseDesc(str) {
  return (str || '')
    .toLowerCase()
    // remove common filler words that vary between CSV rows
    .replace(/\b(at|the|a|an|in|of|for|and|&|-)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

function isDuplicate(row, existing) {
  const desc = normaliseDesc(row.description)
  const date = row._parsedDate
  const amt  = row._amountInINR || 0

  return existing.some(e => {
    const existingDesc = normaliseDesc(e.description)

    // exact normalised match
    const exactMatch = existingDesc === desc

    // fuzzy: one contains the other (handles "dinner marina bites" ⊂ "dinner at marina bites")
    const fuzzyMatch = desc.length > 5 && (
      existingDesc.includes(desc) || desc.includes(existingDesc)
    )

    const descMatch = exactMatch || fuzzyMatch
    const dateMatch = date && new Date(e.date).toDateString() === date.toDateString()
    const amtMatch  = Math.abs((e.amountInINR || 0) - amt) < 1

    return descMatch && dateMatch && amtMatch
  })
}

// ─── bulk import (unchanged) ──────────────────────────────────────────────────
async function importCSV(rows, groupId, batchId) {
  const anomalies = []
  const imported  = []

  const members  = await prisma.groupMember.findMany({ where: { groupId }, include: { user: true } })
  const existing = await prisma.expense.findMany({ where: { groupId } })

  for (let i = 0; i < rows.length; i++) {
    const row    = rows[i]
    const rowNum = i + 2
    const issues = []
    let autoNote = null

    if (!row.description && !row.amount && !row.date) continue

    if (!row.description || !row.description.trim()) {
      anomalies.push({ importBatch: batchId, rowNumber: rowNum, rawData: JSON.stringify(row), issue: 'Missing description — cannot identify this expense', action: 'SKIPPED', anomalyCode: 'MISSING_DESCRIPTION' })
      continue
    }

    if (looksLikeSettlement(row.description, row.notes)) {
      anomalies.push({ importBatch: batchId, rowNumber: rowNum, rawData: JSON.stringify(row), issue: `Settlement detected: "${row.description}" — notes say: "${row.notes || ''}"`, action: 'PENDING_REVIEW', anomalyCode: 'SETTLEMENT_AS_EXPENSE' })
      continue
    }

    const rawAmt    = row.amount
    const parsedAmt = parseAmount(rawAmt)

    if (parsedAmt === null) {
      anomalies.push({ importBatch: batchId, rowNumber: rowNum, rawData: JSON.stringify(row), issue: `Cannot parse amount: "${rawAmt}"`, action: 'SKIPPED', anomalyCode: 'INVALID_AMOUNT' })
      continue
    }

    if (String(rawAmt).includes(',')) { issues.push(`Amount had commas: "${rawAmt}" parsed as ${parsedAmt}`); autoNote = 'COMMA_IN_AMOUNT' }

    if (parsedAmt === 0) {
      anomalies.push({ importBatch: batchId, rowNumber: rowNum, rawData: JSON.stringify(row), issue: `Zero amount for "${row.description}" — notes: "${row.notes || ''}"`, action: 'PENDING_REVIEW', anomalyCode: 'ZERO_AMOUNT' })
      continue
    }

    if (parsedAmt < 0) {
      anomalies.push({ importBatch: batchId, rowNumber: rowNum, rawData: JSON.stringify(row), issue: `Negative amount ${parsedAmt} for "${row.description}" — could be a refund or data error`, action: 'PENDING_REVIEW', anomalyCode: 'NEGATIVE_AMOUNT' })
      continue
    }

    if (String(rawAmt).includes('.') && (String(rawAmt).split('.')[1] || '').length > 2) {
      issues.push(`Unusual precision in amount: ${parsedAmt} — rounded to ${Math.round(parsedAmt * 100) / 100}`)
      autoNote = 'EXCESS_PRECISION'
    }
    const amount = Math.round(parsedAmt * 100) / 100

    const detectedCurrency = detectCurrency(rawAmt, row.currency)
    const currency    = detectedCurrency || 'INR'
    let amountInINR   = amount

    if (!detectedCurrency) {
      anomalies.push({ importBatch: batchId, rowNumber: rowNum, rawData: JSON.stringify(row), issue: `Missing currency for "${row.description}" — amount is ${amount}`, action: 'PENDING_REVIEW', anomalyCode: 'MISSING_CURRENCY' })
      continue
    }

    if (currency === 'USD') {
      amountInINR = Math.round(amount * USD_RATE * 100) / 100
      issues.push(`USD converted: $${amount} → ₹${amountInINR} at ₹${USD_RATE}/USD`)
      autoNote = autoNote || 'USD_CONVERTED'
    }

    row._parsedAmount = amount
    row._amountInINR  = amountInINR
    row._currency     = currency

    const { date: parsedDate, issue: dateIssue } = parseDate(row.date)

    if (dateIssue === 'missing' || dateIssue === 'invalid') {
      anomalies.push({ importBatch: batchId, rowNumber: rowNum, rawData: JSON.stringify(row), issue: `Invalid or missing date: "${row.date}"`, action: 'SKIPPED', anomalyCode: 'INVALID_DATE' })
      continue
    }
    if (dateIssue === 'missing_year') {
      anomalies.push({ importBatch: batchId, rowNumber: rowNum, rawData: JSON.stringify(row), issue: `Date "${row.date}" has no year — cannot determine the correct date`, action: 'PENDING_REVIEW', anomalyCode: 'DATE_MISSING_YEAR' })
      continue
    }
    if (dateIssue === 'ambiguous_date_format') {
      anomalies.push({ importBatch: batchId, rowNumber: rowNum, rawData: JSON.stringify(row), issue: `Ambiguous date "${row.date}" — could be April 5 (DD/MM) or May 4 (MM/DD). Notes: "${row.notes || ''}"`, action: 'PENDING_REVIEW', anomalyCode: 'AMBIGUOUS_DATE' })
      continue
    }

    row._parsedDate = parsedDate

    if (!row.paid_by || !row.paid_by.trim()) {
      anomalies.push({ importBatch: batchId, rowNumber: rowNum, rawData: JSON.stringify(row), issue: `Missing paid_by for "${row.description}" — notes: "${row.notes || ''}"`, action: 'PENDING_REVIEW', anomalyCode: 'MISSING_PAID_BY' })
      continue
    }

    const { member: paidByMember, issue: nameIssue, matched } = findMember(members, row.paid_by)

    if (nameIssue === 'unknown_member') {
      anomalies.push({ importBatch: batchId, rowNumber: rowNum, rawData: JSON.stringify(row), issue: `Unknown member: "${row.paid_by}" — not found in group`, action: 'PENDING_REVIEW', anomalyCode: 'UNKNOWN_MEMBER' })
      continue
    }
    if (nameIssue === 'name_casing') { issues.push(`Name casing fixed: "${row.paid_by}" matched to "${matched}"`); autoNote = autoNote || 'NAME_CASING' }

    if (paidByMember.leftAt && parsedDate > new Date(paidByMember.leftAt)) {
      anomalies.push({ importBatch: batchId, rowNumber: rowNum, rawData: JSON.stringify(row), issue: `${paidByMember.user.name} had left on ${new Date(paidByMember.leftAt).toDateString()} but this expense is dated ${parsedDate.toDateString()}`, action: 'PENDING_REVIEW', anomalyCode: 'POST_DEPARTURE' })
      continue
    }

    const splitWith           = parseSplitWith(row.split_with)
    const resolvedSplitMembers = []
    const unknownInSplit      = []
    const departedInSplit     = []

    for (const name of splitWith) {
      const { member: m, issue: ni } = findMember(members, name)
      if (!m) { unknownInSplit.push(name) }
      else if (m.leftAt && parsedDate > new Date(m.leftAt)) { departedInSplit.push(m.user.name) }
      else { resolvedSplitMembers.push(m) }
    }

    if (unknownInSplit.length > 0) {
      anomalies.push({ importBatch: batchId, rowNumber: rowNum, rawData: JSON.stringify(row), issue: `Unknown members in split_with: ${unknownInSplit.join(', ')} — cannot calculate their share`, action: 'PENDING_REVIEW', anomalyCode: 'UNKNOWN_IN_SPLIT' })
      continue
    }
    if (departedInSplit.length > 0) { issues.push(`Departed members removed from split: ${departedInSplit.join(', ')}`); autoNote = autoNote || 'DEPARTED_IN_SPLIT' }

    const splitMembers = resolvedSplitMembers.length > 0
      ? resolvedSplitMembers
      : members.filter(m => new Date(m.joinedAt) <= parsedDate && (!m.leftAt || new Date(m.leftAt) >= parsedDate))

    const rawSplitType = (row.split_type || '').toUpperCase().trim()
    const validTypes   = ['EQUAL', 'EXACT', 'PERCENTAGE', 'UNEQUAL', 'SHARE', 'PERCENT']
    let splitType      = validTypes.includes(rawSplitType) ? rawSplitType : 'EQUAL'
    if (rawSplitType === 'PERCENTAGE') splitType = 'PERCENT'
    if (rawSplitType === 'UNEQUAL')    splitType = 'EXACT'

    if (rawSplitType === 'EQUAL' && row.split_details && row.split_details.trim()) {
      issues.push(`split_type=EQUAL but split_details provided: "${row.split_details}" — EQUAL used`)
      autoNote = autoNote || 'SPLIT_TYPE_CONFLICT'
    }

    const splitDetails = parseSplitDetails(row.split_details, splitType)
    if ((splitType === 'PERCENT' || splitType === 'PERCENTAGE') && splitDetails) {
      if (!checkPercentagesSum(splitDetails)) {
        const total = Object.values(splitDetails).reduce((s,v) => s+v, 0)
        anomalies.push({ importBatch: batchId, rowNumber: rowNum, rawData: JSON.stringify(row), issue: `Percentages sum to ${total}% not 100% for "${row.description}": ${row.split_details}`, action: 'PENDING_REVIEW', anomalyCode: 'PERCENT_NOT_100' })
        continue
      }
    }

    if (isDuplicate(row, existing)) {
      anomalies.push({ importBatch: batchId, rowNumber: rowNum, rawData: JSON.stringify(row), issue: `Possible duplicate: "${row.description}" on ${parsedDate.toDateString()} ≈ ₹${amountInINR}`, action: 'PENDING_REVIEW', anomalyCode: 'DUPLICATE' })
      continue
    }

    let splits = []
    if (splitType === 'EQUAL') {
      const share = Math.round((amountInINR / splitMembers.length) * 100) / 100
      splits = splitMembers.map(m => ({ userId: m.userId, amount: share }))
    } else if ((splitType === 'EXACT' || splitType === 'UNEQUAL') && splitDetails) {
      splits = splitMembers.map(m => ({ userId: m.userId, amount: splitDetails[m.user.name] || splitDetails[m.user.name.split(' ')[0]] || 0 }))
    } else if (splitType === 'PERCENT' && splitDetails) {
      splits = splitMembers.map(m => ({ userId: m.userId, amount: Math.round(((splitDetails[m.user.name] || 0) / 100) * amountInINR * 100) / 100 }))
    } else if (splitType === 'SHARE' && splitDetails) {
      const totalShares = Object.values(splitDetails).reduce((s,v) => s+v, 0)
      splits = splitMembers.map(m => ({ userId: m.userId, amount: Math.round(((splitDetails[m.user.name] || splitDetails[m.user.name.split(' ')[0]] || 1) / totalShares) * amountInINR * 100) / 100 }))
    } else {
      const share = Math.round((amountInINR / splitMembers.length) * 100) / 100
      splits = splitMembers.map(m => ({ userId: m.userId, amount: share }))
    }

    const importFlag = issues.length ? issues.join(' | ') : null
    const expense = await prisma.expense.create({
      data: { groupId, description: row.description.trim(), amount, currency, amountInINR, date: parsedDate, paidById: paidByMember.userId, splitType, importFlag, splits: { create: splits } }
    })

    imported.push(expense)
    existing.push({ ...expense, splits })

    if (issues.length || autoNote) {
      anomalies.push({ importBatch: batchId, rowNumber: rowNum, rawData: JSON.stringify(row), issue: issues.join(' | ') || `Auto-fixed: ${autoNote}`, action: 'AUTO_FIXED', anomalyCode: autoNote || 'AUTO_FIXED' })
    }
  }

  if (anomalies.length) {
    await prisma.importAnomaly.createMany({
      data: anomalies.map(a => ({
        importBatch: a.importBatch,
        rowNumber:   a.rowNumber,
        rawData:     a.rawData,
        issue:       a.issue,
        action:      a.action,
        groupId      // ✅ store groupId so GET /anomalies/:groupId filter works
      }))
    })
  }

  return { imported: imported.length, total: rows.length, anomalies }
}

// ─── single-row import used when resolving an anomaly ────────────────────────
async function importSingleRow(row, groupId) {
  const members  = await prisma.groupMember.findMany({ where: { groupId }, include: { user: true } })
  // ✅ fetch fresh — catches expenses created by earlier anomaly resolutions
  const existing = await prisma.expense.findMany({ where: { groupId } })

  const parsedAmt = parseAmount(row.amount)
  if (!parsedAmt || parsedAmt <= 0) throw new Error('Invalid amount: ' + row.amount)

  const amount      = Math.round(parsedAmt * 100) / 100
  const currency    = detectCurrency(row.amount, row.currency) || row.currency || 'INR'
  const amountInINR = currency === 'USD' ? Math.round(amount * USD_RATE * 100) / 100 : amount

  const { date: parsedDate } = parseDate(row.date)
  if (!parsedDate) throw new Error('Invalid date: ' + row.date)

  const { member: paidByMember } = findMember(members, row.paid_by)
  if (!paidByMember) throw new Error('Paid_by member not found: ' + row.paid_by)

  // ✅ duplicate check BEFORE creating
  row._parsedDate  = parsedDate
  row._amountInINR = amountInINR

  if (isDuplicate(row, existing)) {
    throw new Error(`DUPLICATE: "${row.description}" on ${parsedDate.toDateString()} ₹${amountInINR} already exists`)
  }

  const splitWith    = parseSplitWith(row.split_with)
  const splitMembers = splitWith.length > 0
    ? splitWith.map(n => findMember(members, n).member).filter(Boolean)
    : members.filter(m => new Date(m.joinedAt) <= parsedDate && (!m.leftAt || new Date(m.leftAt) >= parsedDate))

  if (splitMembers.length === 0) throw new Error('No valid split members found')

  const rawSplitType = (row.split_type || '').toUpperCase().trim()
  let splitType      = rawSplitType || 'EQUAL'
  if (rawSplitType === 'PERCENTAGE') splitType = 'PERCENT'
  if (rawSplitType === 'UNEQUAL')    splitType = 'EXACT'

  const splitDetails = parseSplitDetails(row.split_details, splitType)

  let splits = []
  if (splitType === 'EQUAL' || !splitDetails) {
    const share = Math.round((amountInINR / splitMembers.length) * 100) / 100
    splits = splitMembers.map(m => ({ userId: m.userId, amount: share }))
  } else if ((splitType === 'EXACT' || splitType === 'UNEQUAL') && splitDetails) {
    splits = splitMembers.map(m => ({ userId: m.userId, amount: splitDetails[m.user.name] || splitDetails[m.user.name.split(' ')[0]] || 0 }))
  } else if (splitType === 'PERCENT' && splitDetails) {
    splits = splitMembers.map(m => ({ userId: m.userId, amount: Math.round(((splitDetails[m.user.name] || 0) / 100) * amountInINR * 100) / 100 }))
  } else if (splitType === 'SHARE' && splitDetails) {
    const totalShares = Object.values(splitDetails).reduce((s, v) => s + v, 0)
    splits = splitMembers.map(m => ({ userId: m.userId, amount: Math.round(((splitDetails[m.user.name] || 1) / totalShares) * amountInINR * 100) / 100 }))
  }

  return prisma.expense.create({
    data: {
      groupId,
      description: (row.description || '').trim(),
      amount,
      currency,
      amountInINR,
      date:        parsedDate,
      paidById:    paidByMember.userId,
      splitType,
      importFlag:  'Imported via anomaly resolution',
      splits:      { create: splits }
    }
  })
}

module.exports = { importCSV, importSingleRow }