import React from 'react'

interface Task {
  id: string
  title: string
  agentName: string
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed'
  progress: number
  priority: 'low' | 'medium' | 'high'
  model: string
}

interface TaskQueueProps {
  tasks: Task[]
  filters: {
    status: string
    search: string
    model: string
  }
  onFiltersChange: (filters: {
    status: string
    search: string
    model: string
  }) => void
  onTaskStatusUpdate: (id: string, status: string) => void
}

const statusColors: Record<string, string> = {
  queued: '#6B7280',
  running: '#3B82F6',
  paused: '#F59E0B',
  completed: '#10B981',
  failed: '#EF4444'
}

const priorityColors: Record<string, string> = {
  low: '#6B7280',
  medium: '#F59E0B',
  high: '#EF4444'
}

const TaskQueue: React.FC<TaskQueueProps> = ({
  tasks,
  filters,
  onFiltersChange,
  onTaskStatusUpdate
}) => {
  const handleStatusChange = (id: string, e: React.ChangeEvent<HTMLSelectElement>) => {
    onTaskStatusUpdate(id, e.target.value)
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Task Queue</h2>
        <div className="flex space-x-3">
          <select
            value={filters.status}
            onChange={(e) => onFiltersChange({...filters, status: e.target.value})}
            className="px-3 py-1 rounded border border-gray-300 focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="queued">Queued</option>
            <option value="running">Running</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
          
          <input
            type="text"
            placeholder="Search tasks..."
            value={filters.search}
            onChange={(e) => onFiltersChange({...filters, search: e.target.value})}
            className="px-3 py-1 rounded border border-gray-300 focus:ring-2 focus:ring-blue-500 w-32"
          />
          
          <select
            value={filters.model}
            onChange={(e) => onFiltersChange({...filters, model: e.target.value})}
            className="px-3 py-1 rounded border border-gray-300 focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Models</option>
            <option value="claude-3">Claude 3</option>
            <option value="gpt-4">GPT-4</option>
            <option value="llama-2">Llama 2</option>
          </select>
        </div>
      </div>
      
      {tasks.length === 0 ? (
        <p className="text-center text-gray-500 py-8">No tasks match the current filters.</p>
      ) : (
        <div className="space-y-3">
          {tasks.map(task => (
            <div key={task.id} className="border-l-4 pl-3 py-2 bg-gray-50 rounded-r">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between">
                    <h3 className="font-medium text-gray-900">{task.title}</h3>
                    <span className={`px-2 py-0.5 text-xs rounded ${priorityColors[task.priority]}`}>
                      {task.priority}
                    </span>
                  </div>
                  <div className="flex items-center space-x-3 text-sm text-gray-600 mt-1">
                    <span>by {task.agentName}</span>
                    <span>•</span>
                    <span>using {task.model}</span>
                  </div>
                </div>
                <div className="flex-0 flex-col items-center">
                  <div className={`w-2 h-2 rounded-full bg-${statusColors[task.status]}`}></div>
                  <span className="mt-1 text-xs text-gray-500">{task.status}</span>
                </div>
              </div>
              
              <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                <div 
                  className={`h-2.5 rounded-full bg-${statusColors[task.status]} transition-all duration-300`}
                  style={{ width: `${task.progress}%` }}
                ></div>
              </div>
              
              <div className="flex justify-between items-center mt-2">
                <span className="text-xs text-gray-500">
                  {task.progress}% complete
                </span>
                <div className="flex space-x-2">
                  <select
                    value={task.status}
                    onChange={(e) => handleStatusChange(task.id, e)}
                    className="px-2 py-0.5 text-xs rounded border border-gray-300 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="queued">Queued</option>
                    <option value="running">Running</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option
                  </select>
                  
                  <button
                    onClick={() => {
                      // Simulate progress update for demo
                      const newProgress = Math.min(100, task.progress + 10)
                      // In real app, this would update via API
                      alert(`Task "${task.title}" progress updated to ${newProgress}%`)
                    }}
                    className="px-2 py-0.5 text-xs rounded bg-gray-100 hover:bg-gray-200"
                  >
                    Advance
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

export default TaskQueue