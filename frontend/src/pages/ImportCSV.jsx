import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { importCSV, getAnomalies, resolveAnomaly } from '../api'

const ACTION_STYLE = {
  AUTO_FIXED:     'bg-amber-50 text-amber-700 border border-amber-200',
  QUARANTINED:    'bg-red-50 text-red-700 border border-red-200',
  PENDING_REVIEW: 'bg-blue-50 text-blue-700 border border-blue-200',
  SKIPPED:        'bg-gray-100 text-gray-600 border border-gray-200',
  RECLASSIFIED:   'bg-purple-50 text-purple-700 border border-purple-200',
}

export default function ImportCSV() {
  const { activeGroup }               = useOutletContext()
  const [file, setFile]               = useState(null)
  const [result, setResult]           = useState(null)
  const [anomalies, setAnomalies]     = useState([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [dragging, setDragging]       = useState(false)

  useEffect(() => {
    if (!activeGroup) return
    getAnomalies(activeGroup.id).then(r => setAnomalies(r.data)).catch(() => {})
  }, [activeGroup])

  const handleImport = async (e) => {
    e.preventDefault()
    if (!file || !activeGroup) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await importCSV(activeGroup.id, file)
      setResult(res.data)
      const anoms = await getAnomalies(activeGroup.id)
      setAnomalies(anoms.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Import failed. Check the file and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleResolve = async (id) => {
    try {
      await resolveAnomaly(id)
      setAnomalies(prev => prev.filter(a => a.id !== id))
    } catch (err) {
      alert('Error resolving anomaly')
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.name.endsWith('.csv')) setFile(dropped)
    else setError('Please drop a CSV file')
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Import CSV</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload expenses_export.csv exactly as provided — do not edit it first.
          The importer detects all problems automatically.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <form onSubmit={handleImport} className="flex flex-col gap-4">
          <div
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
              dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
            }`}
            onClick={() => document.getElementById('csv-file').click()}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <div className="text-4xl mb-3">📄</div>
            {file ? (
              <>
                <div className="text-sm font-medium text-gray-800">{file.name}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {(file.size / 1024).toFixed(1)} KB · Click to change
                </div>
              </>
            ) : (
              <>
                <div className="text-sm text-gray-600">Click to select or drag & drop</div>
                <div className="text-xs text-gray-400 mt-1">CSV files only</div>
              </>
            )}
            <input
              id="csv-file"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => { setFile(e.target.files[0]); setError('') }}
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!file || loading || !activeGroup}
            className="bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {loading ? 'Importing...' : 'Import CSV'}
          </button>

          {!activeGroup && (
            <p className="text-xs text-center text-gray-400">Create a group first before importing</p>
          )}
        </form>
      </div>

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
          <div className="text-sm font-medium text-green-800 mb-1">Import complete</div>
          <div className="text-sm text-green-700 space-y-0.5">
            <div>✓ {result.imported} expenses imported successfully</div>
            <div>⚠ {result.anomalies?.length || 0} anomalies detected</div>
            <div>📋 {result.total} total rows processed</div>
          </div>
        </div>
      )}

      {anomalies.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-gray-900">Anomaly report</h2>
              <p className="text-xs text-gray-400 mt-0.5">{anomalies.length} issues need your attention</p>
            </div>
          </div>

          {anomalies.map((a, i) => (
            <div key={a.id} className="p-5 border-b border-gray-100 last:border-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-xs text-gray-400 font-mono">Row {a.rowNumber}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${ACTION_STYLE[a.action] || ACTION_STYLE.SKIPPED}`}>
                      {a.action.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="text-sm text-gray-800 mb-1">{a.issue}</div>
                  <div className="text-xs text-gray-400 font-mono bg-gray-50 border border-gray-200 rounded px-2 py-1.5 break-all">
                    {a.rawData}
                  </div>
                </div>
                <button
                  onClick={() => handleResolve(a.id)}
                  className="text-xs text-green-700 border border-green-200 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg flex-shrink-0 transition-colors"
                >
                  ✓ Resolve
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {anomalies.length === 0 && result && (
        <div className="text-center py-10 text-gray-400 text-sm">
          ✓ All anomalies resolved
        </div>
      )}
    </div>
  )
}
