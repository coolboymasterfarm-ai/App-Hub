import React from 'react'

interface ActivityLogProps {
  logs: {
    id: string
    timestamp: string
    agentId: string
    action: string
    details: string
    level: 'info' | 'warning' | 'error'
  }[]
}

export const ActivityLog = ({ logs }: ActivityLogProps) => {
  const levelColors: Record<string, string> = {
    info: 'text-blue-600',
    warning: 'text-yellow-600',
    error: 'text-red-600'
  }

  const levelIcons: Record<string, string> = {
    info: 'ℹ️',
    warning: '⚠️',
    error: '❌'
  }

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date()
    const past = new Date(timestamp)
    const seconds = Math.floor((now.getTime() - past.getTime()) / 1000)
    
    if (seconds < 60) return `${seconds}s ago`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  return (
    <div className="bg-white rounded-lg shadow border p-4">
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Activity Log</h2>
        <div className="flex space-x-2 text-sm">
          <button
            onClick={() => console.log('Filter by level')}
            className="border rounded px-3 py-1 hover:bg-gray-50 transition-colors"
          >
            All Levels
          </button>
          <button
            onClick={() => console.log('Export log')}
            className="border rounded px-3 py-1 hover:bg-gray-50 transition-colors"
          >
            Export
          </button>
        </div>
      </div>

      {logs.length === 0 ? (
        <p className="text-center text-gray-500 py-8">No activity recorded</p>
      ) : (
        <div className="space-y-2">
          {logs.map(log => (
            <div key={log.id} className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors">
              <div className="flex-shrink-0">
                <span className={`${levelColors[log.level]} text-xl`}>
                  {levelIcons[log.level]}
                </span>
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start mb-1">
                  <h4 className="font-medium text-gray-900 flex-1">
                    {log.action}
                  </h4>
                  <span className="text-xs text-gray-400">
                    {formatTimeAgo(log.timestamp)}
                  </span>
                </div>
                
                <p className="text-sm text-gray-700">{log.details}</p>
                
                {log.level === 'error' && (
                  <div className="mt-2 p-2 bg-red-50 border-l-4 border-red-200 rounded-r text-xs">
                    <p className="text-red-800 font-medium">Error Details:</p>
                    <p className="text-red-600">Agent encountered an issue during execution</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}