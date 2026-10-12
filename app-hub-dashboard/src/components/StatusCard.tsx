import React from 'react'

interface StatusCardProps {
  agent: {
    id: string
    name: string
    model: string
    status: 'running' | 'idle' | 'maintenance' | 'stopped' | 'error'
    uptime: number // seconds
    staleness: number // minutes
    lastSeen: string
  }
}

export const StatusCard = ({ agent }: StatusCardProps) => {
  const statusColors: Record<string, string> = {
    running: 'bg-green-100 text-green-800',
    idle: 'bg-yellow-100 text-yellow-800',
    maintenance: 'bg-blue-100 text-blue-800',
    stopped: 'bg-gray-100 text-gray-800',
    error: 'bg-red-100 text-red-800'
  }

  const statusIcons: Record<string, string> = {
    running: '▶️',
    idle: '⏸️',
    maintenance: '🔧',
    stopped: '⏹️',
    error: '❌'
  }

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}h ${minutes}m`
  }

  return (
    <div className="bg-white rounded-lg shadow border p-4">
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0 h-10 w-10 rounded bg-blue-500/20 flex items-center justify-center text-blue-600">
          <span className="text-lg">{statusIcons[agent.status]}</span>
        </div>
        <div>
          <h3 className="font-medium text-gray-900">{agent.name}</h3>
          <p className="text-sm text-gray-500">{agent.model}</p>
          
          <div className="mt-2 flex flex-wrap gap-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[agent.status]}`}>
              {agent.status}
            </span>
            
            <span className="text-xs text-gray-500">
              Uptime: {formatUptime(agent.uptime)}
            </span>
            
            <span className="text-xs text-gray-500">
              Stale: {agent.staleness.toFixed(1)}m
            </span>
          </div>
          
          <p className="mt-2 text-xs text-gray-400">
            Last seen: {new Date(agent.lastSeen).toLocaleTimeString()}
          </p>
        </div>
      </div>
    </div>
  )
}