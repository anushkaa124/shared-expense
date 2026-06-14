import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useState, useEffect } from 'react'
import { getGroups } from '../api'

export default function Layout() {
  const { user, logout }              = useAuth()
  const navigate                      = useNavigate()
  const [groups, setGroups]           = useState([])
  const [activeGroup, setActiveGroup] = useState(null)

  useEffect(() => {
    getGroups()
      .then(r => {
        setGroups(r.data)
        if (r.data.length > 0) setActiveGroup(r.data[0])
      })
      .catch(() => {})
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const navClass = ({ isActive }) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
      isActive
        ? 'bg-blue-50 text-blue-700 font-medium'
        : 'text-gray-600 hover:bg-gray-100'
    }`

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <div className="w-56 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <div className="font-semibold text-gray-900 text-base">💸 Splitwise</div>
          {activeGroup && (
            <div className="text-xs text-gray-400 mt-0.5">{activeGroup.name}</div>
          )}
        </div>

        {groups.length > 1 && (
          <div className="px-3 pt-3">
            <select
              className="w-full text-xs border border-gray-200 rounded-lg p-2 bg-gray-50"
              value={activeGroup?.id || ''}
              onChange={e => setActiveGroup(groups.find(g => g.id === +e.target.value))}
            >
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        )}

        <nav className="flex-1 p-3 flex flex-col gap-1 mt-1">
          <NavLink to="/"            end className={navClass}>📊 Dashboard</NavLink>
          <NavLink to="/expenses"        className={navClass}>🧾 Expenses</NavLink>
          <NavLink to="/settlements"     className={navClass}>⇄ Settlements</NavLink>
          <NavLink to="/import"          className={navClass}>📤 Import CSV</NavLink>
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="text-xs text-gray-500 mb-2">
            Signed in as{' '}
            <span className="font-medium text-gray-700">{user?.name}</span>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-red-500 hover:text-red-700"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Outlet context={{ activeGroup, setActiveGroup, groups, setGroups }} />
      </div>
    </div>
  )
}
