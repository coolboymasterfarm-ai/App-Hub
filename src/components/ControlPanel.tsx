import React from 'react'

interface Agent {
  id: string
  name: string
  status: 'idle' | 'running' | 'paused' | 'error'
  availableActions: string[]
}

interface ControlPanelProps {
  agents: Agent[]
  onAgentAction: (id: string, action: string) => void
}

const ControlPanel: React.FC<ControlPanelProps> = ({ agents, onAgentAction }) => {
  const handleAction = (id: string, action: string) => {
    onAgentAction(id, action)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-xl font-semibold mb-4">Agent Controls</h2>
        <div className="space-y-3">
          {agents.map(agent => (
            <div key={agent.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
              <div className="flex-1">
                <div className="flex items-center">
                  <div className={`w-3 h-3 rounded-full mr-2 ${agent.status === 'running' ? '#10B981' : 
                              agent.status === 'paused' ? '#F59E0B' : 
                              agent.status === 'error' ? '#EF4444' : '#6B7280'}`}></div>
                  <span className="font-medium">{agent.name}</span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Status: {agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
                </p>
              </div>
              <div className="flex space-x-2">
                {agent.availableActions.map(action => (
                  <button
                    key={action}
                    onClick={() => handleAction(agent.id, action)}
                    disabled={agent.status === 'error' && action !== 'restart'}
                    className="px-2 py-1 text-xs rounded 
                              bg-gray-100 hover:bg-gray-200 
                              disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {action.charAt(0).toUpperCase() + action.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-xl font-semibold mb-4">Bulk Actions</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <button
            onClick={() => {
              // In real app, this would start all idle agents via API
              alert('Starting all idle agents (demo)')
            }}
            className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white"
          >
            Start All Idle
          </button>
          
          <button
            onClick={() => {
              // In real app, this would pause all running agents via API
              alert('Pausing all running agents (demo)')
            }}
            className="px-4 py-2 rounded bg-yellow-600 hover:bg-yellow-700 text-white"
          >
            Pause All Running
          </button>
          
          <button
            onClick={() => {
              // In real app, this would restart all agents via API
              alert('Restarting all agents (demo)')
            }}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white"
          >
            Restart All
          </button>
          
          <button
            onClick={() => {
              // In real app, this would stop all agents via API
              alert('Stopping all agents (demo)')
            }}
            className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white"
          >
            Stop All
          </button>
        </div>
      </div>
    </div>
  )
}

export default ControlPanel