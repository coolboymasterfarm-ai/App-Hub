import React from 'react'

interface ActivityItem {
  id: string
  timestamp: string
  level: 'info' | 'warning' | 'error' | 'success'
  message: string
}

interface ActivityLogProps {
  activity: ActivityItem[]
}

const levelColors: Record<string, string> = {
  info: '#3B82F6',
  warning: '#F59E0B',
  error: '#EF4444',
  success: '#10B981'
}

const levelIcons: Record<string, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  error: '❌',
  success: '✅'
}

const ActivityLog: React.FC<ActivityLogProps> = ({ activity }) => {
  if (activity.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-xl font-semibold mb-4">Activity Log</h2>
        <p className="text-center text-gray-500 py-8">No activity recorded</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h2 className="text-xl font-semibold mb-4">Activity Log</h2>
      <div className="space-y-2">
        {activity.map(item => (
          <div key={item.id} className="flex items-start space-x-3 p-2 border-l-2 pl-3">
            <div className={`w-3 h-3 rounded-full ${levelColors[item.level]}`}></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-900">{item.message}</p>
              <div className="text-xs text-gray-500 flex justify-between">
                <span>{item.timestamp}</span>
                <span className={`text-xs ${levelColors[item.level]}`}>
                  {levelIcons[item.level]}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-4 pt-3 border-t border-gray-200 text-center">
        <button
          onClick={() => {
            // In real app, this would clear activity via API
            alert('Activity log cleared (demo)')
          }}
          className="px-3 py-1 text-sm rounded bg-gray-100 hover:bg-gray-200"
        >
          Clear Log
        </button>
      </div>
    </div>
  )
}

export default ActivityLog