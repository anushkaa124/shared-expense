import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getSettlements, createSettlement, getBalances } from '../api'

export default function Settlements() {
  const { activeGroup }               = useOutletContext()
  const [settlements, setSettlements] = useState([])
  const [balances, setBalances]       = useState(null)
  const [showForm, setShowForm]       = useState(false)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [form, setForm]               = useState({
    payerId: '', receiverId: '', amount: '',
    date: new Date().toISOString().split('T')[0], note: ''
  })

  const members = activeGroup?.members || []

  useEffect(() => {
    if (!activeGroup) return
    getSettlements(activeGroup.id).then(r => setSettlements(r.data)).catch(() => {})
    getBalances(activeGroup.id).then(r => setBalances(r.data)).catch(() => {})
  }, [activeGroup])

  const getMemberName = (id) =>
    members.find(m => m.userId === +id)?.user?.name || `User ${id}`

  const prefill = (t) => {
    setForm({
      payerId:    String(t.from),
      receiverId: String(t.to),
      amount:     String(t.amount),
      date:       new Date().toISOString().split('T')[0],
      note:       ''
    })
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await createSettlement({
        groupId:    activeGroup.id,
        payerId:    +form.payerId,
        receiverId: +form.receiverId,
        amount:     parseFloat(form.amount),
        date:       form.date,
        note:       form.note || undefined
      })
      setSettlements(prev => [res.data, ...prev])
      const bal = await getBalances(activeGroup.id)
      setBalances(bal.data)
      setForm({ payerId: '', receiverId: '', amount: '', date: new Date().toISOString().split('T')[0], note: '' })
      setShowForm(false)
    } catch (err) {
      setError(err.response?.data?.error || 'Error recording payment')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Settlements</h1>
          <p className="text-sm text-gray-500">{activeGroup?.name || 'No group selected'}</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          disabled={!activeGroup}
          className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40"
        >
          + Record payment
        </button>
      </div>

      {balances?.transactions?.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-medium text-blue-900 mb-3">
            Suggested — {balances.transactions.length} payment{balances.transactions.length > 1 ? 's' : ''} clears everything
          </h2>
          {balances.transactions.map((t, i) => (
            <div key={i} className="flex items-center justify-between py-2.5 border-b border-blue-100 last:border-0">
              <div className="text-sm text-blue-800">
                <span className="font-medium">{getMemberName(t.from)}</span>
                <span className="mx-2 text-blue-400">pays</span>
                <span className="font-medium">{getMemberName(t.to)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-blue-900">
                  ₹{t.amount.toLocaleString()}
                </span>
                <button
                  onClick={() => prefill(t)}
                  className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
                >
                  Record
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {balances?.transactions?.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 text-sm text-green-800 flex items-center gap-2">
          <span>✓</span> All balances are settled up!
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="font-semibold text-gray-900 mb-4">Record payment</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <select
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
                value={form.payerId}
                onChange={e => setForm({ ...form, payerId: e.target.value })}
                required
              >
                <option value="">Who paid?</option>
                {members.map(m => (
                  <option key={m.userId} value={m.userId}>{m.user?.name}</option>
                ))}
              </select>

              <select
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
                value={form.receiverId}
                onChange={e => setForm({ ...form, receiverId: e.target.value })}
                required
              >
                <option value="">Paid to?</option>
                {members.map(m => (
                  <option key={m.userId} value={m.userId}>{m.user?.name}</option>
                ))}
              </select>

              <input
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                type="number"
                step="0.01"
                min="0"
                placeholder="Amount (₹)"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                required
              />

              <input
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                type="date"
                value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })}
                required
              />

              <input
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                placeholder="Note (optional)"
                value={form.note}
                onChange={e => setForm({ ...form, note: e.target.value })}
              />

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
                  {loading ? 'Saving...' : 'Record payment'}
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
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-medium text-gray-900">Payment history</h2>
        </div>
        {settlements.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">No payments recorded yet</div>
        ) : settlements.map(s => (
          <div key={s.id} className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 last:border-0">
            <div>
              <div className="text-sm text-gray-800">
                <span className="font-medium">{s.payer?.name}</span>
                <span className="text-gray-400 mx-1.5">paid</span>
                <span className="font-medium">{s.receiver?.name}</span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {new Date(s.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                {s.note && ` · ${s.note}`}
              </div>
            </div>
            <div className="text-sm font-semibold text-green-600">
              ₹{s.amount.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
