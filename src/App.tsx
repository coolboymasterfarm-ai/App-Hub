import React, { useEffect, useState } from 'react'
import StatusCard from './components/StatusCard'
import TaskQueue from './components/TaskQueue'
import PerformanceMetrics from './components/PerformanceMetrics'
import ActivityLog from './components/ActivityLog'
import ControlPanel from './components/ControlPanel'
import './index.css'

function App() {
  const [agents, setAgents] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [performance, setPerformance] = useState<any>(null)
  const [activity, setActivity] = useState<any[]>([])
  const [filters, setFilters] = useState({
    status: 'all',
    search: '',
    model: 'all'
  })

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [agentsRes, tasksRes, perfRes, activityRes] = await Promise.all([
          fetch('/api/agents').then(r => r.json()),
          fetch('/api/tasks').then(r => r.json()),
          fetch('/api/performance').then(r => r.json()),
          fetch('/api/activity').then(r => r.json())
        ])
        setAgents(agentsRes)
        setTasks(tasksRes)
        setPerformance(perfRes)
        setActivity(activityRes)
      } catch (err) {
        console.error('Failed to fetch data:', err)
        // Use mock data if API fails
        setAgents(mockAgents)
        setTasks(mockTasks)
        setPerformance(mockPerformance)
        setActivity(mockActivity)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleAgentAction = async (id: string, action: string) => {
    try {
      await fetch(`/api/agents/${id}/${action}`, { method: 'POST' })
      // Refresh data after action
      const agentsRes = await fetch('/api/agents').then(r => r.json())
      setAgents(agentsRes)
    } catch (err) {
      console.error(`Failed to ${action} agent ${id}:`, err)
    }
  }

  const handleTaskStatusUpdate = async (id: string, status: string) => {
    try {
      await fetch(`/api/tasks/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      const tasksRes = await fetch('/api/tasks').then(r => r.json())
      setTasks(tasksRes)
    } catch (err) {
      console.error(`Failed to update task ${id} status:`, err)
    }
  }

  const filteredTasks = tasks.filter(task => {
    const statusMatch = filters.status === 'all' || task.status === filters.status
    const searchMatch = filters.search === '' || 
      task.title.toLowerCase().includes(filters.search.toLowerCase()) ||
      task.agentName.toLowerCase().includes(filters.search.toLowerCase())
    const modelMatch = filters.model === 'all' || task.model === filters.model
    return statusMatch && searchMatch && modelMatch
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900">
              App Hub Agent Management
            </div>
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StatusCard 
                title="Active Agents" 
                value={agents.filter(a => a.status === 'running').length} 
                total={agents.length}
                trend="up"
                suffix="+2 today"
              />
              <StatusCard 
                title="Tasks Completed" 
                value={tasks.filter(t => t.status === 'completed').length} 
                total={tasks.length}
                trend="up"
                suffix="+15 today"
              />
              <StatusCard 
                title="Avg Response Time" 
                value={performance?.avgLatency ?? '0ms'} 
                trend="down"
                suffix="-12%"
              />
              <StatusCard 
                title="Success Rate" 
                value={performance?.successRate ?? '0%'} 
                trend="up"
                suffix="+3%"
              />
            </div>
          </div>
          
          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2">
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-xl font-semibold mb-4">Agent Status</h2>
                <div className="space-y-3">
                  {agents.map(agent => (
                    <StatusCard 
                      key={agent.id}
                      title={agent.name}
                      value={agent.status}
                      status={agent.status === 'running' ? 'success' : 
                              agent.status === 'paused' ? 'warning' : 
                              agent.status === 'error' ? 'error' : 'muted'}
                      onAction={(action) => handleAgentAction(agent.id, action)}
                      availableActions={agent.availableActions}
                    />
                  ))}
                </div>
              </div>
            </div>
            
            <div className="md:col-span-1">
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-xl font-semibold mb-4">Control Panel</h2>
                <ControlPanel 
                  agents={agents}
                  onAgentAction={handleAgentAction}
                />
              </div>
            </div>
          </div>
          
          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2">
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-xl font-semibold mb-4">Task Queue</h2>
                <TaskQueue 
                  tasks={filteredTasks}
                  filters={filters}
                  onFiltersChange={setFilters}
                  onTaskStatusUpdate={handleTaskStatusUpdate}
                />
              </div>
            </div>
            
            <div className="md:col-span-1">
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-xl font-semibold mb-4">Performance Metrics</h2>
                <PerformanceMetrics data={performance} />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-xl font-semibold mb-4">Activity Log</h2>
            <ActivityLog activity={activity} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default App

// Mock data for demonstration
const mockAgents = [
  { id: '1', name: 'Research Agent', status: 'running', uptime: '2h 15m', 
    availableActions: ['pause', 'restart'] },
  { id: '2', name: 'Engineer Agent', status: 'paused', uptime: '45m', 
    availableActions: ['start', 'restart'] },
  { id: '3', name: 'QA Tester Agent', status: 'running', uptime: '1h 30m', 
    availableActions: ['pause', 'restart'] },
  { id: '4', name: 'Designer Agent', status: 'error', uptime: '0', 
    availableActions: ['restart'] },
  { id: '5', name: 'Reviewer Agent', status: 'idle', uptime: '3h 0m', 
    availableActions: ['start'] }
]

const mockTasks = [
  { id: '1', title: 'Research UI/UX best practices', agentName: 'Research Agent', 
    status: 'completed', progress: 100, priority: 'high', model: 'claude-3' },
  { id: '2', title: 'Design dashboard layout', agentName: 'Designer Agent', 
    status: 'paused', progress: 60, priority: 'medium', model: 'gpt-4' },
  { id: '3', title: 'Build agent monitoring API', agentName: 'Engineer Agent', 
    status: 'running', progress: 35, priority: 'high', model: 'claude-3' },
  { id: '4', title: 'Test dashboard responsiveness', agentName: 'QA Tester Agent', 
    status: 'queued', progress: 0, priority: 'low', model: 'gpt-4' },
  { id: '5', title: 'Review code quality', agentName: 'Reviewer Agent', 
    status: 'completed', progress: 100, priority: 'medium', model: 'claude-3' }
]

const mockPerformance = {
  tokenUsage: '1.2M',
  avgLatency: '245ms',
  successRate: '98.7%',
  cost: '$23.45'
}

const mockActivity = [
  { id: '1', timestamp: '2026-10-12 14:30:22', level: 'info', 
    message: 'Research Agent started task: Research UI/UX best practices' },
  { id: '2', timestamp: '2026-10-12 14:29:45', level: 'warning', 
    message: 'Designer Agent paused due to high memory usage' },
  { id: '3', timestamp: '2026-10-12 14:28:10', level: 'success', 
    message: 'Engineer Agent completed: Build agent monitoring API' },
  { id: '4', timestamp: '2026-10-12 14:27:33', level: 'info', 
    message: 'QA Tester Agent queued task: Test dashboard responsiveness' },
  { id: '5', timestamp: '2026-10-12 14:26:15', level: 'error', 
    message: 'Reviewer Agent encountered validation error' }
]