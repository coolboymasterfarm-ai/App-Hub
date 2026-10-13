import React from 'react'

interface ControlPanelProps {
  agents: {
    id: string
    name: string
    model: string
    status: 'running' | 'idle' | 'maintenance' | 'stopped' | 'error'
    uptime: number
    staleness: number
    lastSeen: string
  }[]
  onAgentAction: (action: string, agentId: string) => void
}

export const ControlPanel = ({ agents, onAgentAction }: ControlPanelProps) => {
  const handleAgentAction = (action: string, agentId: string) => {
    onAgentAction(action, agentId)
  }

  return (
    <div className="bg-white rounded-lg shadow border p-6">
      <h2 className="mb-4 text-xl font-semibold text-gray-900">Agent Controls</h2>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Agent
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Uptime
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {agents.map(agent => (
              <tr key={agent.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0 h-10 w-10 rounded bg-blue-500/20 flex items-center justify-center text-blue-600">
                      <span className="text-lg">🤖</span>
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-gray-900">{agent.name}</h4>
                      <p className="text-xs text-gray-500">{agent.model}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium 
                    ${agent.status === 'running' ? 'bg-green-100 text-green-800' :
                      agent.status === 'idle' ? 'bg-yellow-100 text-yellow-800' :
                      agent.status === 'maintenance' ? 'bg-blue-100 text-blue-800' :
                      agent.status === 'stopped' ? 'bg-gray-100 text-gray-800' :
                      'bg-red-100 text-red-800'}`}
                  >
                    {agent.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {Math.floor(agent.uptime / 3600)}h {Math.floor((agent.uptime % 3600) / 60)}m
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex space-x-2">
                    {agent.status !== 'running' && (
                      <button
                        onClick={() => handleAgentAction('start', agent.id)}
                        className="px-3 py-1.5 text-sm font-medium text-green-600 border border-green-300 rounded hover:bg-green-50 transition-colors disabled:opacity-50"
                        disabled={agent.status === 'running'}
                      >
                        Start
                      </button>
                    )}
                    
                    {agent.status === 'running' && (
                      <>
                        <button
                          onClick={() => handleAgentAction('pause', agent.id)}
                          className="px-3 py-1.5 text-sm font-medium text-yellow-600 border border-yellow-300 rounded hover:bg-yellow-50 transition-colors"
                        >
                          Pause
                        </button>
                        
                        <button
                          onClick={() => handleAgentAction('stop', agent.id)}
                          className="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-300 rounded hover:bg-red-50 transition-colors"
                        >
                          Stop
                        </button>
                      </>
                    )}
                    
                    {agent.status !== 'running' && agent.status !== 'error' && (
                      <button
                        onClick={() => handleAgentAction('restart', agent.id)}
                        className="px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-300 rounded hover:bg-blue-50 transition-colors"
                      >
                        Restart
                      </button>
                    )}
                    
                    {agent.status === 'error' && (
                      <button
                        onClick={() => handleAgentAction('restart', agent.id)}
                        className="px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-300 rounded hover:bg-blue-50 transition-colors"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Batch Actions</h3>
            <p className="text-sm text-gray-500">
              Apply actions to multiple agents at once
            </p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => console.log('Start all agents')}
              className="px-4 py-2 text-sm font-medium text-green-600 border border-green-300 rounded hover:bg-green-50 transition-colors"
            >
              Start All
            </button>
            
            <button
              onClick={() => console.log('Stop all agents')}
              className="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded hover:bg-red-50 transition-colors"
            >
              Stop All
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}