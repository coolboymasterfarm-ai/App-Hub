import React from 'react'

interface StatusCardProps {
  title: string
  value: string | number
  status?: 'success' | 'warning' | 'error' | 'muted' | 'info'
  trend?: 'up' | 'down' | 'neutral'
  suffix?: string
  total?: number
  onAction?: (action: string) => void
  availableActions?: string[]
}

const StatusCard: React.FC<StatusCardProps> = ({
  title,
  value,
  status = 'info',
  trend = 'neutral',
  suffix,
  total,
  onAction,
  availableActions = []
}) => {
  const statusColors: Record<string, string> = {
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    muted: '#6B7280',
    info: '#3B82F6'
  }

  const trendIcons: Record<string, string> = {
    up: '▲',
    down: '▼',
    neutral: '→'
  }

  const trendColors: Record<string, string> = {
    up: '#10B981',
    down: '#EF4444',
    neutral: '#6B7280'
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-500">{title}</h3>
        {availableActions.length > 0 && onAction && (
          <div className="flex space-x-2">
            {availableActions.map(action => (
              <button
                key={action}
                onClick={() => onAction(action)}
                className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200"
              >
                {action.charAt(0).toUpperCase() + action.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-gray-900">
        {typeof value === 'number' ? value.toLocaleString() : value}
        {suffix && <span className="ml-1 text-sm text-gray-500">{suffix}</span>}
      </div>
      {total !== undefined && (
        <p className="text-xs text-gray-500 mt-1">
          {total} total
        </p>
      )}
      <div className="flex items-center mt-2">
        <span className={`text-xs font-medium ${trendColors[trend]}`}>
          {trendIcons[trend]} {trend === 'neutral' ? 'Stable' : 
            trend === 'up' ? 'Improving' : 'Declining'}
        </span>
      </div>
    </div>
  )
}

export default StatusCard