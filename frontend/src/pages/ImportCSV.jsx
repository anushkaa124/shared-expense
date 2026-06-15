import { useState, useEffect, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { importCSV, getAnomalies, resolveAnomaly, register, addMember, createExpense, createSettlement, getGroup } from '../api'

const ACTION_STYLE = {
  AUTO_FIXED:    'bg-amber-50 text-amber-700 border border-amber-200',
  QUARANTINED:   'bg-red-50 text-red-700 border border-red-200',
  PENDING_REVIEW:'bg-blue-50 text-blue-700 border border-blue-200',
  SKIPPED:       'bg-gray-100 text-gray-600 border border-gray-200',
  RECLASSIFIED:  'bg-purple-50 text-purple-700 border border-purple-200',
}

// ─── individual resolution UIs per anomaly code ───────────────────────────────

function SettlementResolution({ raw, activeGroup, onDone }) {
  const [loading, setLoading] = useState(false)
  const members = activeGroup?.members || []
  const payer   = members.find(m => m.user.name.toLowerCase() === (raw.paid_by||'').toLowerCase())
  const amount  = parseFloat(String(raw.amount||'0').replace(/[₹$,]/g,''))

  const handleSettle = async (receiverName) => {
    setLoading(true)
    try {
      const receiver = members.find(m => m.user.name.toLowerCase() === receiverName.toLowerCase())
      if (!payer || !receiver) { alert('Could not find members'); return }
      await createSettlement({
        groupId:    activeGroup.id,
        payerId:    payer.userId,
        receiverId: receiver.userId,
        amount,
        date:       raw.date || new Date().toISOString().split('T')[0],
        note:       `Imported from CSV: ${raw.description}`
      })
      onDone(`Recorded as settlement: ${payer.user.name} → ${receiver.user.name} ₹${amount}`)
    } catch(e) { alert(e.response?.data?.error || 'Error') }
    finally { setLoading(false) }
  }

  // figure out who received from split_with
  const splitWith = (raw.split_with||'').split(';').map(s=>s.trim()).filter(Boolean)

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
      <div className="text-xs font-medium text-purple-800 mb-3">
        This looks like a settlement payment, not a shared expense. What do you want to do?
      </div>
      <div className="flex flex-col gap-2">
        {splitWith.map(name => (
          <button key={name} disabled={loading} onClick={() => handleSettle(name)}
            className="w-full bg-purple-600 text-white text-sm py-2.5 rounded-lg hover:bg-purple-700 font-medium disabled:opacity-50">
            ✓ Record as settlement: {raw.paid_by} → {name} ₹{amount}
          </button>
        ))}
        <button disabled={loading} onClick={() => onDone('Skipped — discarded settlement row')}
          className="w-full border border-purple-300 text-purple-700 text-sm py-2.5 rounded-lg hover:bg-purple-100">
          🗑 Discard this row entirely
        </button>
      </div>
    </div>
  )
}

function DuplicateResolution({ raw, onDone }) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
      <div className="text-xs font-medium text-blue-800 mb-2">
        This row looks like a duplicate of an already-imported expense. What should we do?
      </div>
      <div className="text-xs text-blue-600 mb-3">
        💡 Check the description, date, and amount carefully before deciding
      </div>
      <div className="flex flex-col gap-2">
        <button onClick={() => onDone('Skipped — confirmed duplicate, discarded')}
          className="w-full bg-blue-600 text-white text-sm py-2.5 rounded-lg hover:bg-blue-700 font-medium">
          🗑 Skip — this IS a duplicate, discard it
        </button>
        <button onClick={() => onDone('Kept — user confirmed this is a separate valid expense')}
          className="w-full border border-blue-300 text-blue-700 text-sm py-2.5 rounded-lg hover:bg-blue-100">
          ✓ Keep — this is a SEPARATE valid expense
        </button>
      </div>
    </div>
  )
}

function UnknownMemberResolution({ raw, anomaly, activeGroup, resolvedUsers, onDone, onUserCreated }) {
  const unknownName  = anomaly.issue.match(/Unknown member: "(.+?)"/)?.[1] ||
                       anomaly.issue.match(/unknown members in split_with: (.+?) —/i)?.[1] || ''
  const [showForm, setShowForm] = useState(false)
  const [name, setName]         = useState(unknownName)
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('password123')
  const [joinedAt, setJoinedAt] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleCreate = async () => {
  if (!name || !email) { setError('Name and email required'); return }
  setLoading(true)
  setError('')
  try {
    const res  = await register({ name, email, password })
    const user = res.data.user
    // addMember now returns retroactiveSplitsUpdated
    const memberRes = await addMember(activeGroup.id, { email, joinedAt: joinedAt || undefined })
    const { retroactiveSplitsUpdated, message } = memberRes.data

    resolvedUsers.current[unknownName.toLowerCase()] = user
    await onUserCreated()

    const doneMsg = retroactiveSplitsUpdated > 0
      ? `Created "${name}" and updated ${retroactiveSplitsUpdated} existing expense(s) to include them`
      : `Created user "${name}" (${email}) and added to group`
    onDone(doneMsg)
  } catch(e) {
    setError(e.response?.data?.error || 'Error creating user')
  } finally { setLoading(false) }
}

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
      <div className="text-xs font-medium text-orange-800 mb-3">
        "{unknownName}" is not registered in the system. What do you want to do?
      </div>
      {!showForm ? (
        <div className="flex flex-col gap-2">
          <button onClick={() => setShowForm(true)}
            className="w-full bg-orange-500 text-white text-sm py-2.5 rounded-lg hover:bg-orange-600 font-medium">
            👤 Create "{unknownName}" as new user & keep this row
          </button>
          <button onClick={() => onDone(`Skipped — "${unknownName}" not created, row discarded`)}
            className="w-full border border-orange-300 text-orange-700 text-sm py-2.5 rounded-lg hover:bg-orange-100">
            🗑 Skip this row — don't create the user
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-orange-400"
            placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />
          <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-orange-400"
            placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-orange-400"
            placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
          <div>
            <label className="text-xs text-gray-500 block mb-1">Join date (optional)</label>
            <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-orange-400 w-full"
              type="date" value={joinedAt} onChange={e => setJoinedAt(e.target.value)} />
          </div>
          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={loading}
              className="flex-1 bg-orange-500 text-white text-sm py-2.5 rounded-lg hover:bg-orange-600 disabled:opacity-50 font-medium">
              {loading ? 'Creating...' : '✓ Create & continue'}
            </button>
            <button onClick={() => { setShowForm(false); setError('') }}
              className="flex-1 border border-gray-200 text-gray-600 text-sm py-2.5 rounded-lg">Back</button>
          </div>
        </div>
      )}
    </div>
  )
}

function MissingCurrencyResolution({ raw, activeGroup, onDone }) {
  const [currency, setCurrency] = useState('INR')
  const amount = parseFloat(String(raw.amount||'0').replace(/[₹$,\s]/g,'')) || 0

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
      <div className="text-xs font-medium text-yellow-800 mb-3">
        Currency is missing for this expense (amount: {amount}). What currency is it in?
      </div>
      <div className="flex gap-2 mb-3">
        {['INR','USD','EUR','GBP'].map(c => (
          <button key={c} onClick={() => setCurrency(c)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              currency === c ? 'bg-yellow-500 text-white border-yellow-500' : 'border-yellow-300 text-yellow-700 hover:bg-yellow-100'
            }`}>{c}</button>
        ))}
      </div>
      {currency === 'USD' && (
        <div className="text-xs text-yellow-700 mb-3 bg-yellow-100 rounded px-3 py-2">
          Will convert: ${amount} → ₹{Math.round(amount * 83.45 * 100)/100} at ₹83.45/USD
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => onDone(`Currency set to ${currency} and row imported`)}
          className="flex-1 bg-yellow-500 text-white text-sm py-2.5 rounded-lg hover:bg-yellow-600 font-medium">
          ✓ Use {currency} for this expense
        </button>
        <button onClick={() => onDone('Skipped — currency unknown, row discarded')}
          className="flex-1 border border-yellow-300 text-yellow-700 text-sm py-2.5 rounded-lg hover:bg-yellow-100">
          🗑 Skip this row
        </button>
      </div>
    </div>
  )
}

function AmbiguousDateResolution({ raw, onDone }) {
  const parts   = (raw.date || '').split('/')
  const optionA = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : ''  // DD/MM → YYYY-MM-DD
  const optionB = parts.length === 3 ? `${parts[2]}-${parts[0]}-${parts[1]}` : ''  // MM/DD → YYYY-MM-DD
  const labelA  = optionA ? new Date(optionA).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
  const labelB  = optionB ? new Date(optionB).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
      <div className="text-xs font-medium text-indigo-800 mb-1">
        Date "{raw.date}" is ambiguous. Which date is correct?
      </div>
      <div className="text-xs text-indigo-600 mb-3">Notes: "{raw.notes || 'none'}"</div>
      <div className="flex flex-col gap-2">
        {/* ✅ pass resolved date string in second arg */}
        <button onClick={() => onDone(`Date confirmed as DD/MM: ${labelA}`, { date: optionA })}
          className="w-full bg-indigo-600 text-white text-sm py-2.5 rounded-lg hover:bg-indigo-700 font-medium">
          📅 {labelA} (DD/MM/YYYY)
        </button>
        <button onClick={() => onDone(`Date confirmed as MM/DD: ${labelB}`, { date: optionB })}
          className="w-full border border-indigo-300 text-indigo-700 text-sm py-2.5 rounded-lg hover:bg-indigo-100">
          📅 {labelB} (MM/DD/YYYY)
        </button>
        <button onClick={() => onDone('Skipped — date too ambiguous', null, 'SKIP')}
          className="w-full border border-gray-200 text-gray-600 text-sm py-2 rounded-lg hover:bg-gray-50 text-xs">
          🗑 Skip — cannot determine the date
        </button>
      </div>
    </div>
  )
}

function MissingYearResolution({ raw, onDone }) {
  const [year, setYear] = useState('2026')
  const months = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 }
  const parts  = (raw.date||'').split(' ')
  const mon    = months[parts[0]] || 1
  const day    = parseInt(parts[1]) || 1

  return (
    <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
      <div className="text-xs font-medium text-teal-800 mb-3">
        Date "{raw.date}" has no year. Which year does this belong to?
      </div>
      <div className="flex gap-2 mb-3">
        {['2025','2026','2027'].map(y => (
          <button key={y} onClick={() => setYear(y)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border ${
              year === y ? 'bg-teal-500 text-white border-teal-500' : 'border-teal-300 text-teal-700 hover:bg-teal-100'
            }`}>{y}</button>
        ))}
      </div>
      <div className="text-xs text-teal-700 mb-3">
        Will import as: {new Date(`${year}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}
      </div>
      <div className="flex gap-2">
        <button onClick={() => onDone(`Year set to ${year}, imported as ${raw.date} ${year}`)}
          className="flex-1 bg-teal-500 text-white text-sm py-2.5 rounded-lg hover:bg-teal-600 font-medium">
          ✓ Use {year}
        </button>
        <button onClick={() => onDone('Skipped — year unknown, row discarded')}
          className="flex-1 border border-teal-300 text-teal-700 text-sm py-2.5 rounded-lg">
          🗑 Skip
        </button>
      </div>
    </div>
  )
}

function MissingPaidByResolution({ raw, activeGroup, onDone }) {
  const [selected, setSelected] = useState('')
  const members = (activeGroup?.members || []).filter(m => !m.leftAt)

  return (
    <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
      <div className="text-xs font-medium text-rose-800 mb-3">
        No one is recorded as having paid for "{raw.description}". Who paid?
      </div>
      <select className="w-full border border-rose-300 rounded-lg px-3 py-2.5 text-sm mb-3 bg-white outline-none"
        value={selected} onChange={e => setSelected(e.target.value)}>
        <option value="">Select who paid</option>
        {members.map(m => <option key={m.userId} value={m.user.name}>{m.user.name}</option>)}
      </select>
      <div className="flex gap-2">
        {/* ✅ pass resolved paid_by */}
        <button disabled={!selected} onClick={() => onDone(`paid_by set to ${selected}`, { paid_by: selected })}
          className="flex-1 bg-rose-600 text-white text-sm py-2.5 rounded-lg hover:bg-rose-700 font-medium disabled:opacity-40">
          ✓ {selected ? `${selected} paid` : 'Select someone first'}
        </button>
        <button onClick={() => onDone('Skipped — paid_by unknown', null, 'SKIP')}
          className="flex-1 border border-rose-300 text-rose-700 text-sm py-2.5 rounded-lg">
          🗑 Skip
        </button>
      </div>
    </div>
  )
}


function PercentNotHundredResolution({ raw, onDone }) {
  const parts  = (raw.split_details||'').split(';').map(s=>s.trim()).filter(Boolean)
  const total  = parts.reduce((s,p) => { const m=p.match(/([\d.]+)%?$/); return s+(m?parseFloat(m[1]):0) },0)
  return (
    <div className="bg-pink-50 border border-pink-200 rounded-xl p-4">
      <div className="text-xs font-medium text-pink-800 mb-2">
        Percentages sum to {total}% instead of 100%. Split details: "{raw.split_details}"
      </div>
      <div className="text-xs text-pink-600 mb-3">
        Notes: "{raw.notes || 'none'}"
      </div>
      <div className="flex flex-col gap-2">
        <button onClick={() => onDone('Normalised percentages to sum to 100% and imported')}
          className="w-full bg-pink-600 text-white text-sm py-2.5 rounded-lg hover:bg-pink-700 font-medium">
          ✓ Normalise to 100% and import
          <div className="text-xs opacity-80 mt-0.5">Each % ÷ {total} × 100 — proportions preserved</div>
        </button>
        <button onClick={() => onDone('Split equally instead — percentages were wrong')}
          className="w-full border border-pink-300 text-pink-700 text-sm py-2.5 rounded-lg hover:bg-pink-100">
          ⚖ Split equally instead
        </button>
        <button onClick={() => onDone('Skipped — percentages unresolvable')}
          className="w-full border border-gray-200 text-gray-600 text-sm py-2 rounded-lg text-xs">
          🗑 Skip this row
        </button>
      </div>
    </div>
  )
}

function ZeroAmountResolution({ raw, onDone }) {
  return (
    <div className="bg-gray-50 border border-gray-300 rounded-xl p-4">
      <div className="text-xs font-medium text-gray-700 mb-2">
        Amount is ₹0 for "{raw.description}". Notes: "{raw.notes||'none'}"
      </div>
      <div className="flex flex-col gap-2">
        <button onClick={() => onDone('Skipped — zero amount, likely a placeholder or already counted')}
          className="w-full bg-gray-600 text-white text-sm py-2.5 rounded-lg hover:bg-gray-700 font-medium">
          🗑 Discard — this was a placeholder or duplicate fix
        </button>
        <button onClick={() => onDone('Kept as ₹0 record for tracking purposes')}
          className="w-full border border-gray-300 text-gray-700 text-sm py-2.5 rounded-lg hover:bg-gray-100">
          ✓ Keep as ₹0 record
        </button>
      </div>
    </div>
  )
}

function NegativeAmountResolution({ raw, onDone }) {
  const amount = Math.abs(parseFloat(String(raw.amount||'0').replace(/[₹$,\s]/g,''))||0)
  return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
      <div className="text-xs font-medium text-green-800 mb-2">
        Negative amount ({raw.amount}) for "{raw.description}". Is this a refund or a data error?
      </div>
      <div className="flex flex-col gap-2">
        <button onClick={() => onDone(`Imported as refund: +₹${amount} credited back to group`)}
          className="w-full bg-green-600 text-white text-sm py-2.5 rounded-lg hover:bg-green-700 font-medium">
          ✓ Treat as refund — credit ₹{amount} back to group
        </button>
        <button onClick={() => onDone('Skipped — negative amount was a data entry error')}
          className="w-full border border-green-300 text-green-700 text-sm py-2.5 rounded-lg hover:bg-green-100">
          🗑 Discard — this was a data entry error
        </button>
      </div>
    </div>
  )
}

function PostDepartureResolution({ raw, onDone }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
      <div className="text-xs font-medium text-red-800 mb-3">
        The payer had already left the group before this expense date. What should we do?
      </div>
      <div className="flex flex-col gap-2">
        <button onClick={() => onDone('Discarded — member had left, expense correctly excluded')}
          className="w-full bg-red-600 text-white text-sm py-2.5 rounded-lg hover:bg-red-700 font-medium">
          🗑 Discard — they had left, this should not count
        </button>
        <button onClick={() => onDone('Override — imported despite departure date')}
          className="w-full border border-red-300 text-red-700 text-sm py-2.5 rounded-lg hover:bg-red-100">
          ⚠ Override — import it anyway
        </button>
      </div>
    </div>
  )
}

function AutoFixedResolution({ anomaly, onDone }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
      <div className="text-xs font-medium text-amber-800 mb-3">
        This was imported automatically with a fix applied. Does the fix look correct?
      </div>
      <div className="flex gap-2">
        <button onClick={() => onDone('Confirmed — auto-fix accepted')}
          className="flex-1 bg-amber-500 text-white text-sm py-2.5 rounded-lg hover:bg-amber-600 font-medium">
          ✓ Yes, looks correct
        </button>
        <button onClick={() => onDone('Rejected — will fix manually')}
          className="flex-1 border border-amber-300 text-amber-700 text-sm py-2.5 rounded-lg hover:bg-amber-100">
          ✗ No, this is wrong
        </button>
      </div>
    </div>
  )
}

// ─── detect anomaly code from issue string ────────────────────────────────────
function detectCode(anomaly) {
  const issue = (anomaly.issue || '').toLowerCase()
  if (issue.includes('settlement') || issue.includes('paid back') || issue.includes('deposit share')) return 'SETTLEMENT_AS_EXPENSE'
  if (issue.includes('duplicate') || issue.includes('possible duplicate')) return 'DUPLICATE'
  if (issue.includes('unknown member') && !issue.includes('split_with')) return 'UNKNOWN_MEMBER'
  if (issue.includes('unknown members in split_with')) return 'UNKNOWN_IN_SPLIT'
  if (issue.includes('missing currency')) return 'MISSING_CURRENCY'
  if (issue.includes('ambiguous date')) return 'AMBIGUOUS_DATE'
  if (issue.includes('no year') || issue.includes('missing_year') || issue.includes('has no year')) return 'DATE_MISSING_YEAR'
  if (issue.includes('missing paid_by') || issue.includes('paid_by')) return 'MISSING_PAID_BY'
  if (issue.includes('percentages sum') || issue.includes('percent')) return 'PERCENT_NOT_100'
  if (issue.includes('zero amount')) return 'ZERO_AMOUNT'
  if (issue.includes('negative amount')) return 'NEGATIVE_AMOUNT'
  if (issue.includes('had left') || issue.includes('post_departure') || issue.includes('departure')) return 'POST_DEPARTURE'
  if (anomaly.action === 'AUTO_FIXED') return 'AUTO_FIXED'
  return 'GENERIC'
}

// ─── main anomaly card ────────────────────────────────────────────────────────
function AnomalyCard({ anomaly, activeGroup, resolvedUsers, onResolve, onUserCreated }) {
  const [done, setDone]         = useState(false)
  const [decision, setDecision] = useState('')

  let rawObj = {}
  try { rawObj = JSON.parse(anomaly.rawData) } catch {}

  const code = detectCode(anomaly)

  // ✅ resolution = { date, currency, paid_by, splitType } — forwarded to backend
  // ✅ action = 'SKIP' | 'DISCARD' | 'RESOLVED' (default)
  const handleDone = async (label, resolution = null, action = 'RESOLVED') => {
    setDecision(label)
    setDone(true)
    await onResolve(anomaly.id, resolution, action)
  }

  if (done) {
    return (
      <div className="p-4 border-b border-gray-100 last:border-0 bg-green-50">
        <div className="flex items-center gap-2 text-sm text-green-700">
          <span>✓</span>
          <span>Row {anomaly.rowNumber} — <span className="font-medium">{decision}</span></span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-5 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs text-gray-400 font-mono bg-gray-100 px-2 py-0.5 rounded">Row {anomaly.rowNumber}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${ACTION_STYLE[anomaly.action] || ACTION_STYLE.SKIPPED}`}>
          {anomaly.action.replace(/_/g, ' ')}
        </span>
        <span className="text-xs text-gray-400 italic">{code.replace(/_/g, ' ')}</span>
      </div>

      <div className="text-sm font-medium text-gray-800 mb-2">{anomaly.issue}</div>

      {Object.keys(rawObj).length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3 grid grid-cols-2 gap-x-4 gap-y-1">
          {Object.entries(rawObj).filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="flex gap-1 text-xs">
              <span className="text-gray-400 min-w-fit">{k}:</span>
              <span className="text-gray-700 font-medium truncate">{String(v)}</span>
            </div>
          ))}
        </div>
      )}

      {code === 'SETTLEMENT_AS_EXPENSE' && <SettlementResolution raw={rawObj} activeGroup={activeGroup} onDone={handleDone} />}
      {code === 'DUPLICATE'             && <DuplicateResolution raw={rawObj} onDone={handleDone} />}
      {(code === 'UNKNOWN_MEMBER' || code === 'UNKNOWN_IN_SPLIT') && (
        <UnknownMemberResolution raw={rawObj} anomaly={anomaly} activeGroup={activeGroup} resolvedUsers={resolvedUsers} onDone={handleDone} onUserCreated={onUserCreated} />
      )}
      {code === 'MISSING_CURRENCY'  && <MissingCurrencyResolution raw={rawObj} activeGroup={activeGroup} onDone={handleDone} />}
      {code === 'AMBIGUOUS_DATE'    && <AmbiguousDateResolution raw={rawObj} onDone={handleDone} />}
      {code === 'DATE_MISSING_YEAR' && <MissingYearResolution raw={rawObj} onDone={handleDone} />}
      {code === 'MISSING_PAID_BY'   && <MissingPaidByResolution raw={rawObj} activeGroup={activeGroup} onDone={handleDone} />}
      {code === 'PERCENT_NOT_100'   && <PercentNotHundredResolution raw={rawObj} onDone={handleDone} />}
      {code === 'ZERO_AMOUNT'       && <ZeroAmountResolution raw={rawObj} onDone={handleDone} />}
      {code === 'NEGATIVE_AMOUNT'   && <NegativeAmountResolution raw={rawObj} onDone={handleDone} />}
      {code === 'POST_DEPARTURE'    && <PostDepartureResolution raw={rawObj} onDone={handleDone} />}
      {code === 'AUTO_FIXED'        && <AutoFixedResolution anomaly={anomaly} onDone={handleDone} />}
      {code === 'GENERIC'           && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-600 mb-3">Unrecognised issue. Acknowledge and move on.</div>
          <button onClick={() => handleDone('Acknowledged')}
            className="w-full border border-gray-300 text-gray-600 text-sm py-2.5 rounded-lg hover:bg-gray-100">
            Acknowledge & dismiss
          </button>
        </div>
      )}
    </div>
  )
}


// ─── main page ────────────────────────────────────────────────────────────────
export default function ImportCSV() {
  const { activeGroup, setActiveGroup, setGroups } = useOutletContext()
  const [file, setFile]           = useState(null)
  const [result, setResult]       = useState(null)
  const [anomalies, setAnomalies] = useState([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [dragging, setDragging]   = useState(false)
  const [tab, setTab]             = useState('upload')
  const resolvedUsers             = useRef({})

  useEffect(() => {
    if (!activeGroup) return
    getAnomalies(activeGroup.id)
      .then(r => { setAnomalies(r.data); if (r.data.length > 0) setTab('anomalies') })
      .catch(() => {})
  }, [activeGroup])

  const refreshGroup = async () => {
    try {
      const res = await getGroup(activeGroup.id)
      setActiveGroup(res.data)
      setGroups(prev => prev.map(g => g.id === res.data.id ? res.data : g))
    } catch {}
  }

  const handleImport = async (e) => {
    e.preventDefault()
    if (!file || !activeGroup) return
    setLoading(true); setError(''); setResult(null)
    try {
      const res   = await importCSV(activeGroup.id, file)
      setResult(res.data)
      const anoms = await getAnomalies(activeGroup.id)
      setAnomalies(anoms.data)
      if (anoms.data.length > 0) setTab('anomalies')
    } catch (err) {
      setError(err.response?.data?.error || 'Import failed')
    } finally { setLoading(false) }
  }

  const handleResolve = async (id, resolution = null, action = 'RESOLVED') => {
  try {
    await resolveAnomaly(id, { action, resolution })
    setAnomalies(prev => prev.filter(a => a.id !== id))
  } catch {
    alert('Error resolving anomaly')
  }
}

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f?.name.endsWith('.csv')) { setFile(f); setError('') }
    else setError('Please drop a CSV file')
  }

  const groupByCode = (list) => {
    const groups = {}
    list.forEach(a => {
      const c = detectCode(a)
      if (!groups[c]) groups[c] = []
      groups[c].push(a)
    })
    return groups
  }

  const grouped = groupByCode(anomalies)

  const LABEL = {
    SETTLEMENT_AS_EXPENSE: '💳 Settlement as expense',
    DUPLICATE:             '🔁 Duplicate entries',
    UNKNOWN_MEMBER:        '👤 Unknown member',
    UNKNOWN_IN_SPLIT:      '👥 Unknown in split',
    MISSING_CURRENCY:      '💱 Missing currency',
    AMBIGUOUS_DATE:        '📅 Ambiguous date',
    DATE_MISSING_YEAR:     '📅 Date missing year',
    MISSING_PAID_BY:       '❓ Missing paid by',
    PERCENT_NOT_100:       '📊 Percentages ≠ 100%',
    ZERO_AMOUNT:           '0️⃣ Zero amount',
    NEGATIVE_AMOUNT:       '➖ Negative amount',
    POST_DEPARTURE:        '🚪 Post-departure expense',
    AUTO_FIXED:            '🔧 Auto-fixed — confirm',
    GENERIC:               '⚠ Other issues',
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Import CSV</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload expenses_export.csv as-is. Every anomaly is detected and shown with clear resolution options.
        </p>
      </div>

      {/* tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {['upload','anomalies'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t === 'upload' ? 'Upload' : 'Anomaly review'}
            {t === 'anomalies' && anomalies.length > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {anomalies.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* upload tab */}
      {tab === 'upload' && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <form onSubmit={handleImport} className="flex flex-col gap-4">
            <div
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
              onClick={() => document.getElementById('csv-file').click()}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <div className="text-4xl mb-3">📄</div>
              {file ? (
                <><div className="text-sm font-medium text-gray-800">{file.name}</div>
                <div className="text-xs text-gray-400 mt-1">{(file.size/1024).toFixed(1)} KB · Click to change</div></>
              ) : (
                <><div className="text-sm text-gray-600 mb-1">Click to select or drag & drop</div>
                <div className="text-xs text-gray-400">CSV files only</div></>
              )}
              <input id="csv-file" type="file" accept=".csv" className="hidden"
                onChange={e => { setFile(e.target.files[0]); setError('') }} />
            </div>

            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>}

            {result && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="text-sm font-medium text-green-800 mb-2">Import complete</div>
                <div className="space-y-1 text-sm text-green-700">
                  <div>✓ {result.imported} expenses imported cleanly</div>
                  <div>⚠ {result.anomalies?.length || 0} anomalies need review</div>
                  <div>📋 {result.total} total rows processed</div>
                </div>
                {result.anomalies?.length > 0 && (
                  <button type="button" onClick={() => setTab('anomalies')}
                    className="mt-3 text-xs bg-green-700 text-white px-3 py-1.5 rounded-lg hover:bg-green-800">
                    Review {result.anomalies.length} anomalies →
                  </button>
                )}
              </div>
            )}

            <button type="submit" disabled={!file || loading || !activeGroup}
              className="bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
              {loading ? 'Importing...' : 'Import CSV'}
            </button>
            {!activeGroup && <p className="text-xs text-center text-gray-400">Create a group first</p>}
          </form>
        </div>
      )}

      {/* anomaly tab */}
      {tab === 'anomalies' && (
        <div>
          {anomalies.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
              <div className="text-3xl mb-3">✅</div>
              <div className="text-sm font-medium text-gray-700">All anomalies resolved</div>
              <div className="text-xs text-gray-400 mt-1">Every flagged row has been reviewed</div>
            </div>
          ) : (
            <>
              {/* summary of anomaly types */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
                <div className="text-xs font-medium text-gray-600 mb-3">
                  {anomalies.length} issue{anomalies.length > 1 ? 's' : ''} across {Object.keys(grouped).length} categories — work through them below
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(grouped).map(([code, items]) => (
                    <span key={code} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                      {LABEL[code] || code} ({items.length})
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {anomalies.map(a => (
                  <AnomalyCard
                    key={a.id}
                    anomaly={a}
                    activeGroup={activeGroup}
                    resolvedUsers={resolvedUsers}
                    onResolve={handleResolve}
                    onUserCreated={refreshGroup}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
