import { useEffect, useState } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { getBalances, getExpenses, createGroup, addMember, removeMember, getGroups } from '../api'
import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const { activeGroup, setActiveGroup, groups, setGroups } = useOutletContext()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [balances, setBalances]         = useState(null)
  const [expenses, setExpenses]         = useState([])
  const [showCreate, setShowCreate]     = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)
  const [groupName, setGroupName]       = useState('')
  const [memberEmail, setMemberEmail]   = useState('')
  const [memberJoined, setMemberJoined] = useState('')
  const [loading, setLoading]           = useState(false)
  const [memberLoading, setMemberLoading] = useState(false)
  const [error, setError]               = useState('')
  const [memberError, setMemberError]   = useState('')

  useEffect(() => {
    if (!activeGroup) return
    getBalances(activeGroup.id).then(r => setBalances(r.data)).catch(() => {})
    getExpenses(activeGroup.id).then(r => setExpenses(r.data.slice(0, 6))).catch(() => {})
  }, [activeGroup])

  const handleCreateGroup = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await createGroup({ name: groupName })
      const updated = await getGroups()
      setGroups(updated.data)
      setActiveGroup(res.data)
      setGroupName('')
      setShowCreate(false)
    } catch (err) {
      setError(err.response?.data?.error || 'Error creating group')
    } finally {
      setLoading(false)
    }
  }

  const handleAddMember = async (e) => {
    e.preventDefault()
    setMemberLoading(true)
    setMemberError('')
    try {
      await addMember(activeGroup.id, { email: memberEmail, joinedAt: memberJoined || undefined })
      const updated = await getGroups()
      setGroups(updated.data)
      setActiveGroup(updated.data.find(g => g.id === activeGroup.id))
      setMemberEmail('')
      setMemberJoined('')
      setShowAddMember(false)
    } catch (err) {
      setMemberError(err.response?.data?.error || 'Error adding member')
    } finally {
      setMemberLoading(false)
    }
  }

  const handleRemoveMember = async (uid, name) => {
    if (!confirm(`Mark ${name} as left today?`)) return
    try {
      await removeMember(activeGroup.id, uid, { leftAt: new Date().toISOString() })
      const updated = await getGroups()
      setGroups(updated.data)
      setActiveGroup(updated.data.find(g => g.id === activeGroup.id))
    } catch (err) {
      alert(err.response?.data?.error || 'Error')
    }
  }

  const myNet = balances?.net?.[user?.id]
  const myBalance = myNet ? Math.round(myNet * 100) / 100 : 0

  const getMemberName = (id) =>
    activeGroup?.members?.find(m => m.userId === id)?.user?.name || `User ${id}`

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">
            {activeGroup ? activeGroup.name : 'Create a group to get started'}
          </p>
        </div>
        <div className="flex gap-2">
          {activeGroup && (
            <button
              onClick={() => setShowAddMember(true)}
              className="text-sm border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50"
            >
              + Add member
            </button>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            + New group
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="font-semibold text-gray-900 mb-4">Create group</h2>
            <form onSubmit={handleCreateGroup} className="flex flex-col gap-3">
              <input
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                placeholder="Group name e.g. Flat 4B"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                required
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={loading} className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium">
                  {loading ? 'Creating...' : 'Create'}
                </button>
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddMember && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="font-semibold text-gray-900 mb-1">Add member</h2>
            <p className="text-xs text-gray-500 mb-4">They must have registered first</p>
            <form onSubmit={handleAddMember} className="flex flex-col gap-3">
              <input
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                placeholder="Email address"
                type="email"
                value={memberEmail}
                onChange={e => setMemberEmail(e.target.value)}
                required
              />
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Joined date (optional)</label>
                <input
                  className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-400 w-full"
                  type="date"
                  value={memberJoined}
                  onChange={e => setMemberJoined(e.target.value)}
                />
              </div>
              {memberError && <p className="text-xs text-red-500">{memberError}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={memberLoading} className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium">
                  {memberLoading ? 'Adding...' : 'Add member'}
                </button>
                <button type="button" onClick={() => setShowAddMember(false)} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeGroup ? (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">Your balance</div>
              <div className={`text-2xl font-semibold ${myBalance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {myBalance >= 0 ? '+' : ''}₹{Math.abs(myBalance).toLocaleString()}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {myBalance > 0 ? 'you are owed' : myBalance < 0 ? 'you owe' : 'all settled'}
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">Total expenses</div>
              <div className="text-2xl font-semibold text-gray-900">
                ₹{expenses.reduce((s, e) => s + e.amountInINR, 0).toLocaleString()}
              </div>
              <div className="text-xs text-gray-400 mt-1">{expenses.length} recent shown</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">Payments to settle</div>
              <div className="text-2xl font-semibold text-gray-900">
                {balances?.transactions?.length || 0}
              </div>
              <div className="text-xs text-gray-400 mt-1">minimum transactions</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-gray-900">Recent expenses</h2>
                <button onClick={() => navigate('/expenses')} className="text-xs text-blue-600 hover:underline">View all</button>
              </div>
              {expenses.length === 0 ? (
                <p className="text-sm text-gray-400">No expenses yet</p>
              ) : expenses.map(exp => (
                <div key={exp.id} className="flex items-start justify-between py-2.5 border-b border-gray-100 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-800 truncate">{exp.description}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {new Date(exp.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      {' · '}{exp.paidBy?.name}
                      {' · '}<span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-xs">{exp.splitType}</span>
                    </div>
                    {exp.importFlag && (
                      <div className="text-xs text-amber-600 mt-0.5">⚠ {exp.importFlag}</div>
                    )}
                  </div>
                  <div className="text-right ml-3 flex-shrink-0">
                    <div className="text-sm font-medium text-gray-900">₹{exp.amountInINR.toLocaleString()}</div>
                    {exp.currency !== 'INR' && (
                      <div className="text-xs text-blue-500">${exp.amount}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-4">
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-medium text-gray-900">Settle up</h2>
                  <button onClick={() => navigate('/settlements')} className="text-xs text-blue-600 hover:underline">View all</button>
                </div>
                {!balances?.transactions?.length ? (
                  <div className="text-sm text-green-600">✓ All settled up!</div>
                ) : balances.transactions.map((t, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
                    <div className="text-sm text-gray-700">
                      <span className="font-medium">{getMemberName(t.from)}</span>
                      <span className="text-gray-400 mx-1.5">→</span>
                      <span className="font-medium">{getMemberName(t.to)}</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900">₹{t.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h2 className="text-sm font-medium text-gray-900 mb-3">Members</h2>
                {activeGroup.members?.map(m => (
                  <div key={m.userId} className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0">
                    <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-xs font-medium flex-shrink-0">
                      {m.user?.name?.[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-800">{m.user?.name}</div>
                      <div className="text-xs text-gray-400">
                        joined {new Date(m.joinedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {m.leftAt && ` · left ${new Date(m.leftAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                      </div>
                    </div>
                    {!m.leftAt && m.userId !== user?.id && (
                      <button
                        onClick={() => handleRemoveMember(m.userId, m.user?.name)}
                        className="text-xs text-gray-400 hover:text-red-500"
                      >
                        remove
                      </button>
                    )}
                    {m.leftAt && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">left</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-20">
          <div className="text-4xl mb-3">💸</div>
          <p className="text-gray-500 text-sm mb-4">No group yet. Create one to get started.</p>
          <button onClick={() => setShowCreate(true)} className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700">
            Create group
          </button>
        </div>
      )}
    </div>
  )
}
