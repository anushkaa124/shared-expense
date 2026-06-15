import api from './client'
export const login            = (data)           => api.post('/auth/login', data)
export const register         = (data)           => api.post('/auth/register', data)
export const getMe            = ()               => api.get('/auth/me')
export const getGroups        = ()               => api.get('/groups')
export const createGroup      = (data)           => api.post('/groups', data)
export const getGroup         = (id)             => api.get(`/groups/${id}`)
export const addMember        = (id, data)       => api.post(`/groups/${id}/members`, data)
export const removeMember     = (id, uid, data)  => api.patch(`/groups/${id}/members/${uid}/leave`, data)
export const getExpenses      = (groupId)        => api.get(`/expenses/group/${groupId}`)
export const createExpense    = (data)           => api.post('/expenses', data)
export const deleteExpense    = (id)             => api.delete(`/expenses/${id}`)
export const getBalances      = (groupId)        => api.get(`/expenses/group/${groupId}/balances`)
export const getSettlements   = (groupId)        => api.get(`/settlements/group/${groupId}`)
export const createSettlement = (data)           => api.post('/settlements', data)
export const importCSV        = (groupId, file)  => {
  const form = new FormData()
  form.append('file', file)
  return api.post(`/import/${groupId}`, form)
}
export const getAnomalies     = (groupId)        => api.get(`/import/anomalies/${groupId}`)

// ✅ Now sends resolution data (date, currency, paid_by, action, shouldImport)
export const resolveAnomaly   = (id, data)       => api.patch(`/import/anomalies/${id}/resolve`, data)