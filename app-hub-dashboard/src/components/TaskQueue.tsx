import React, { useState } from 'react'

interface TaskQueueProps {
  tasks: {
    id: string
    name: string
    agentId: string
    status: 'queued' | 'running' | 'completed' | 'failed'
    progress: number // 0-100
    priority: 'low' | 'normal' | 'high'
    error?: string
  }[]
  onAgentAction: (action: string, agentId: string) => void
  filters: {
    status: 'all' | 'queued' | 'running' | 'completed' | 'failed'
    search: string
    model: 'all' | string
  }
  onFilterChange: (filters: {
    status: 'all' | 'queued' | 'running' | 'completed' | 'failed'
    search: string
    model: 'all' | string
  }) => void
}

export const TaskQueue = ({ 
  tasks, 
  onAgentAction,
  filters,
  onFilterChange
}: TaskQueueProps) => {
  const [sortBy, setSortBy] = useState<'priority' | 'status' | 'name'>('priority')

  const statusColors: Record<string, string> = {
    queued: 'bg-yellow-100 text-yellow-800',
    running: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800'
  }

  const priorityColors: Record<string, string> = {
    low: 'bg-gray-100 text-gray-800',
    normal: 'bg-blue-100 text-blue-800',
    high: 'bg-red-100 text-red-800'
  }

  const handleStatusChange = (taskId: string, newStatus: string) => {
    // In a real app, this would call an API to update task status
    console.log(`Changing task ${taskId} status to ${newStatus}`)
    // For demo, we'll just log it
  }

  const filteredTasks = tasks.filter(task => {
    if (filters.status !== 'all' && task.status !== filters.status) return false
    if (filters.search && 
        !task.name.toLowerCase().includes(filters.search.toLowerCase())) return false
    return true
  })

  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (sortBy === 'priority') {
      const priorityOrder = { high: 3, normal: 2, low: 1 }
      return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0)
    }
    if (sortBy === 'status') {
      const statusOrder = { running: 4, queued: 3, failed: 2, completed: 1 }
      return (statusOrder[b.status] || 0) - (statusOrder[a.status] || 0)
    }
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="bg-white rounded-lg shadow border p-4">
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Task Queue</h2>
        <div className="flex space-x-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="border rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="priority">Sort by Priority</option>
            <option value="status">Sort by Status</option>
            <option value="name">Sort by Name</option>
          </select>
          
          <input
            type="text"
            placeholder="Search tasks..."
            value={filters.search}
            onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
            className="border rounded px-3 py-1 w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {sortedTasks.length === 0 ? (
        <p className="text-center text-gray-500 py-8">No tasks found</p>
      ) : (
        <div className="space-y-3">
          {sortedTasks.map(task => (
            <div key={task.id} className="border rounded-lg p-3 hover:shadow-sm transition-shadow">
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-medium text-gray-900 flex-1">{task.name}</h4>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[task.status]}`}>
                  {task.status}
                </span>
              </div>
              
              <div className="flex items-center mb-2">
                <div className="flex-1">
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className={`h-2.5 rounded-full transition-all duration-300 ${priorityColors[task.priority]} `}
                      style={{ width: `${task.progress}%` }}
                    ></div>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Progress: {task.progress}%
                  </p>
                </div>
                
                <span className={`ml-3 px-2 py-1 rounded-full text-xs font-medium ${priorityColors[task.priority]}`}>
                  {task.priority}
                </span>
              </div>
              
              {task.agentId && (
                <div className="flex items-center space-x-2 text-sm text-gray-500">
                  <span>Agent:</span>
                  <span className="font-medium">{task.agentId}</span>
                </div>
              )}
              
              {task.error && (
                <div className="mt-2 p-2 bg-red-50 border-l-4 border-red-200 rounded-r text-sm">
                  <p className="text-red-800 font-medium">Error:</p>
                  <p className="text-red-600">{task.error}</p>
                </div>
              )}
              
              <div className="mt-3 pt-2 border-t border-gray-200">
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleStatusChange(task.id, 'running')}
                    disabled={task.status === 'running'}
                    className="flex-1 px-3 py-1.5 border rounded hover:bg-blue-50 disabled:opacity-50 transition-colors"
                  >
                    Start
                  </button>
                  
                  <button
                    onClick={() => handleStatusChange(task.id, 'paused')}
                    disabled={task.status !== 'running'}
                    className="flex-1 px-3 py-1.5 border rounded hover:bg-yellow-50 disabled:opacity-50 transition-colors"
                  >
                    Pause
                  </button>
                  
                  <button
                    onClick={() => handleStatusChange(task.id, 'completed')}
                    disabled={task.status === 'completed'}
                    className="flex-1 px-3 py-1.5 border rounded hover:bg-green-50 disabled:opacity-50 transition-colors"
                  >
                    Complete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}