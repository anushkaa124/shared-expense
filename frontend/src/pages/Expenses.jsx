import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getExpenses, createExpense, deleteExpense } from '../api'

const SPLIT_TYPES = ['EQUAL', 'EXACT', 'PERCENT', 'SHARE']

const empty = {
  description: '', amount: '', currency: 'INR',
  date: new Date().toISOString().split('T')[0],
  paidById: '', splitType: 'EQUAL', customSplits: {}
}

export default function Expenses() {
  const { activeGroup }           = useOutletContext()
  const [expenses, setExpenses]   = useState([])
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState(empty)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [search, setSearch]       = useState('')

  useEffect(() => {
    if (!activeGroup) return
    getExpenses(activeGroup.id).then(r => setExpenses(r.data)).catch(() => {})
  }, [activeGroup])

  const expenseDate = new Date(form.date)

const activeMembers =
  activeGroup?.members?.filter(m => {

    const joinedAt =
      new Date(m.joinedAt)

    const leftAt =
      m.leftAt
        ? new Date(m.leftAt)
        : null

    return (
      joinedAt <= expenseDate &&
      (
        !leftAt ||
        leftAt >= expenseDate
      )
    )

  }) || []

  const computeSplits = () => {
    const amount = parseFloat(form.amount) || 0
    const inINR  = form.currency === 'USD' ? amount * 83.45 : amount

    if (form.splitType === 'EQUAL') {
      const share = Math.round((inINR / activeMembers.length) * 100) / 100
      return activeMembers.map(m => ({ userId: m.userId, amount: share }))
    }

    if (form.splitType === 'EXACT') {
      return activeMembers.map(m => ({
        userId: m.userId,
        amount: parseFloat(form.customSplits[m.userId] || 0)
      }))
    }

    if (form.splitType === 'PERCENT') {
      return activeMembers.map(m => ({
        userId: m.userId,
        amount: Math.round((parseFloat(form.customSplits[m.userId] || 0) / 100) * inINR * 100) / 100
      }))
    }

    if (form.splitType === 'SHARE') {
      const totalShares = activeMembers.reduce((s, m) => s + (parseFloat(form.customSplits[m.userId] || 1)), 0)
      return activeMembers.map(m => ({
        userId: m.userId,
        amount: Math.round(((parseFloat(form.customSplits[m.userId] || 1)) / totalShares) * inINR * 100) / 100
      }))
    }
    return []
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const amount    = parseFloat(form.amount)
      const amountInINR = form.currency === 'USD' ? Math.round(amount * 83.45 * 100) / 100 : amount
      const splits    = computeSplits()

      const res = await createExpense({
        groupId:    activeGroup.id,
        description: form.description,
        amount,
        currency:   form.currency,
        amountInINR,
        date:       form.date,
        paidById:   +form.paidById,
        splitType:  form.splitType,
        splits
      })
      setExpenses(prev => [res.data, ...prev])
      setForm(empty)
      setShowForm(false)
    } catch (err) {
      setError(err.response?.data?.error || 'Error adding expense')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this expense?')) return
    try {
      await deleteExpense(id)
      setExpenses(prev => prev.filter(e => e.id !== id))
    } catch (err) {
      alert(err.response?.data?.error || 'Error')
    }
  }

  const filtered = expenses.filter(e =>
    e.description.toLowerCase().includes(search.toLowerCase())
  )

  const symbol = form.currency === 'USD' ? '$' : '₹'

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Expenses</h1>
          <p className="text-sm text-gray-500">{activeGroup?.name || 'No group selected'}</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          disabled={!activeGroup}
          className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40"
        >
          + Add expense
        </button>
      </div>

      <input
        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm mb-4 outline-none focus:border-blue-400"
        placeholder="Search expenses..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="font-semibold text-gray-900 mb-4">Add expense</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                placeholder="Description e.g. Electricity bill"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                required
              />

              <div className="flex gap-2">
                <input
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                  placeholder="Amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                  required
                />
                <select
                  className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
                  value={form.currency}
                  onChange={e => setForm({ ...form, currency: e.target.value })}
                >
                  <option value="INR">₹ INR</option>
                  <option value="USD">$ USD</option>
                </select>
              </div>

              {form.currency === 'USD' && form.amount && (
                <div className="text-xs text-blue-600 bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg">
                  ≈ ₹{(parseFloat(form.amount) * 83.45).toFixed(2)} at ₹83.45/USD
                </div>
              )}

              <input
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                type="date"
                value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })}
                required
              />

              <select
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
                value={form.paidById}
                onChange={e => setForm({ ...form, paidById: e.target.value })}
                required
              >
                <option value="">Who paid?</option>
                {activeMembers.map(m => (
                  <option key={m.userId} value={m.userId}>{m.user?.name}</option>
                ))}
              </select>

              <select
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
                value={form.splitType}
                onChange={e => setForm({ ...form, splitType: e.target.value, customSplits: {} })}
              >
                {SPLIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>

              {form.splitType !== 'EQUAL' && (
                <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <div className="text-xs text-gray-500 mb-2">
                    {form.splitType === 'EXACT'   && 'Enter exact amount per person (₹)'}
                    {form.splitType === 'PERCENT'  && 'Enter percentage per person (must total 100%)'}
                    {form.splitType === 'SHARE'    && 'Enter shares per person (e.g. 1, 2, 3)'}
                  </div>
                  {activeMembers.map(m => (
                    <div key={m.userId} className="flex items-center gap-2 mb-2 last:mb-0">
                      <div className="w-6 h-6 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-xs font-medium flex-shrink-0">
                        {m.user?.name?.[0]}
                      </div>
                      <span className="text-sm text-gray-700 w-20 truncate">{m.user?.name}</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-blue-400"
                        placeholder={form.splitType === 'PERCENT' ? '%' : form.splitType === 'SHARE' ? 'shares' : symbol}
                        value={form.customSplits[m.userId] || ''}
                        onChange={e => setForm({
                          ...form,
                          customSplits: { ...form.customSplits, [m.userId]: e.target.value }
                        })}
                      />
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <div className="flex gap-2 mt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Add expense'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setError('') }}
                  className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">
            {search ? 'No matching expenses' : 'No expenses yet — add one or import CSV'}
          </div>
        ) : filtered.map(exp => (
          <div key={exp.id} className="flex items-start gap-3 p-4 border-b border-gray-100 last:border-0 hover:bg-gray-50">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-gray-900">{exp.description}</span>
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{exp.splitType}</span>
                {exp.currency !== 'INR' && (
                  <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{exp.currency}</span>
                )}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {new Date(exp.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                {' · paid by '}{exp.paidBy?.name}
              </div>
              {exp.importFlag && (
                <div className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded mt-1">
                  ⚠ {exp.importFlag}
                </div>
              )}
              <div className="flex flex-wrap gap-1 mt-1.5">
                {exp.splits?.map(s => (
                  <span key={s.id} className="text-xs bg-gray-50 border border-gray-200 text-gray-500 px-2 py-0.5 rounded-full">
                    {s.user?.name}: ₹{s.amount.toLocaleString()}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-sm font-semibold text-gray-900">
                ₹{exp.amountInINR.toLocaleString()}
              </div>
              {exp.currency !== 'INR' && (
                <div className="text-xs text-gray-400">${exp.amount}</div>
              )}
              <button
                onClick={() => handleDelete(exp.id)}
                className="text-xs text-red-400 hover:text-red-600 mt-1 block"
              >
                delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
