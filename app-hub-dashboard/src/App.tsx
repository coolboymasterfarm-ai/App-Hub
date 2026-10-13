import React, { useState, useEffect } from 'react'
import { StatusCard } from './components/StatusCard'
import { TaskQueue } from './components/TaskQueue'
import { PerformanceMetrics } from './components/PerformanceMetrics'
import { ActivityLog } from './components/ActivityLog'
import { ControlPanel } from './components/ControlPanel'
import { FilterControls } from './components/FilterControls'

function App() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [performanceData, setPerformanceData] = useState<PerformanceData>({
    tokenUsage: 0,
    latency: 0,
    cost: 0,
    successRate: 0
  })
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([])
  const [filters, setFilters] = useState<Filters>({
    status: 'all',
    search: '',
    model: 'all'
  })

  useEffect(() => {
    // Fetch initial data from mock API
    fetchInitialData()
    
    // Set up real-time updates
    const interval = setInterval(() => {
      updateMockData()
    }, 5000)
    
    return () => clearInterval(interval)
  }, [])

  const fetchInitialData = async () => {
    try {
      const [agentsRes, tasksRes, perfRes, activityRes] = await Promise.all([
        fetch('/api/agents').then(r => r.json()),
        fetch('/api/tasks').then(r => r.json()),
        fetch('/api/performance').then(r => r.json()),
        fetch('/api/activity').then(r => r.json())
      ])
      
      setAgents(agentsRes)
      setTasks(tasksRes)
      setPerformanceData(perfRes)
      setActivityLog(activityRes)
    } catch (error) {
      console.error('Failed to fetch initial data:', error)
      // Use mock data if API fails
      setMockData()
    }
  }

  const updateMockData = () => {
    // Simulate real-time updates
    setAgents(prev => prev.map(agent => ({
      ...agent,
      uptime: agent.uptime + 5,
      staleness: Math.max(0, agent.staleness - Math.random() * 2),
      status: Math.random() > 0.9 ? 
        (agent.status === 'running' ? 'idle' : 'running') : 
        agent.status
    })))
    
    setTasks(prev => {
      // Simulate task progress
      const updated = prev.map(task => {
        if (task.status === 'running') {
          const progress = Math.min(100, task.progress + Math.random() * 10)
          return {
            ...task,
            progress,
            status: progress >= 100 ? 'completed' : 'running'
          }
        }
        return task
      })
      
      // Add new tasks occasionally
      if (Math.random() > 0.7 && updated.length < 10) {
        updated.push({
          id: `task-${Date.now()}`,
          name: `Process data batch ${Math.floor(Math.random() * 100)}`,
          agentId: updated[Math.floor(Math.random() * updated.length)]?.agentId || 'agent-1',
          status: 'queued',
          progress: 0,
          priority: Math.random() > 0.5 ? 'high' : 'normal'
        })
      }
      
      return updated
    })
    
    setPerformanceData(prev => ({
      ...prev,
      tokenUsage: prev.tokenUsage + Math.floor(Math.random() * 150),
      latency: Math.max(50, prev.latency + (Math.random() - 0.5) * 20),
      cost: prev.cost + Math.random() * 0.002,
      successRate: Math.min(100, Math.max(0, prev.successRate + (Math.random() - 0.5) * 2))
    }))
    
    setActivityLog(prev => {
      const newEntry: ActivityLogEntry = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        agentId: `agent-${Math.floor(Math.random() * 3) + 1}`,
        action: ['Started task', 'Completed task', 'Failed task', 'Retrying'][Math.floor(Math.random() * 4)],
        details: Math.random() > 0.5 ? 'Processing user request' : 'Waiting for input',
        level: Math.random() > 0.8 ? 'error' : Math.random() > 0.6 ? 'warning' : 'info'
      }
      
      return [newEntry, ...prev.slice(0, 9)]
    })
  }

  const setMockData = () => {
    setAgents([
      {
        id: 'agent-1',
        name: 'Research Assistant',
        model: 'llama3.2:3b',
        status: 'running',
        uptime: 3420,
        staleness: 0,
        lastSeen: new Date(Date.now() - 30000).toISOString()
      },
      {
        id: 'agent-2',
        name: 'Code Generator',
        model: 'codellama:7b',
        status: 'idle',
        uptime: 1800,
        staleness: 2.5,
        lastSeen: new Date(Date.now() - 120000).toISOString()
      },
      {
        id: 'agent-3',
        name: 'Data Analyst',
        model: 'mistral:7b',
        status: 'maintenance',
        uptime: 0,
        staleness: 0,
        lastSeen: new Date(Date.now() - 3600000).toISOString()
      }
    ])
    
    setTasks([
      {
        id: 'task-1',
        name: 'Analyze market trends',
        agentId: 'agent-1',
        status: 'running',
        progress: 65,
        priority: 'high'
      },
      {
        id: 'task-2',
        name: 'Generate UI components',
        agentId: 'agent-2',
        status: 'queued',
        progress: 0,
        priority: 'normal'
      },
      {
        id: 'task-3',
        name: 'Process sales data',
        agentId: 'agent-3',
        status: 'failed',
        progress: 30,
        priority: 'high',
        error: 'Timeout exceeded'
      }
    ])
    
    setPerformanceData({
      tokenUsage: 12450,
      latency: 145,
      cost: 0.87,
      successRate: 92.5
    })
    
    setActivityLog([
      {
        id: 'log-1',
        timestamp: new Date(Date.now() - 300000).toISOString(),
        agentId: 'agent-1',
        action: 'Started task',
        details: 'Analyzing market trends for Q4',
        level: 'info'
      },
      {
        id: 'log-2',
        timestamp: new Date(Date.now() - 180000).toISOString(),
        agentId: 'agent-2',
        action: 'Queued task',
        details: 'UI component generation queued',
        level: 'info'
      }
    ])
  }

  const handleFilterChange = (filters: Filters) => {
    setFilters(filters)
  }

  const handleAgentAction = (action: string, agentId: string) => {
    // Handle start/stop/pause/restart actions
    console.log(`Performing ${action} on agent ${agentId}`)
    // In a real app, this would call the API
    setActivityLog(prev => [{
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      agentId,
      action: `${action.charAt(0).toUpperCase() + action.slice(1)} agent`,
      details: `Agent ${agentId} ${action}ed via dashboard`,
      level: 'info'
    }, ...prev.slice(0, 9)])
  }

  const filteredAgents = agents.filter(agent => {
    if (filters.status !== 'all' && agent.status !== filters.status) return false
    if (filters.search && 
        !agent.name.toLowerCase().includes(filters.search.toLowerCase()) && 
        !agent.model.toLowerCase().includes(filters.search.toLowerCase())) return false
    return true
  })

  const filteredTasks = tasks.filter(task => {
    if (filters.status !== 'all' && task.status !== filters.status) return false
    if (filters.search && 
        !task.name.toLowerCase().includes(filters.search.toLowerCase())) return false
    return true
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">App Hub Agent Management Dashboard</h1>
          <p className="mt-1 text-sm text-gray-600">Real-time monitoring and control of AI agents</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* Status Cards */}
          <div className="md:col-span-2 lg:col-span-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {filteredAgents.map(agent => (
                <StatusCard key={agent.id} agent={agent} />
              ))}
            </div>
          </div>

          {/* Task Queue */}
          <div className="md:col-span-2 lg:col-span-4">
            <TaskQueue 
              tasks={filteredTasks} 
              onAgentAction={handleAgentAction}
              filters={filters}
              onFilterChange={handleFilterChange}
            />
          </div>

          {/* Performance Metrics */}
          <div className="lg:col-span-4">
            <PerformanceMetrics data={performanceData} />
          </div>

          {/* Activity Log */}
          <div className="lg:col-span-4">
            <ActivityLog logs={activityLog} />
          </div>
        </div>

        {/* Control Panel (Full width at bottom) */}
        <div className="mt-6">
          <ControlPanel 
            agents={filteredAgents} 
            onAgentAction={handleAgentAction}
          />
        </div>
      </main>
    </div>
  )
}

interface Agent {
  id: string
  name: string
  model: string
  status: 'running' | 'idle' | 'maintenance' | 'stopped' | 'error'
  uptime: number // seconds
  staleness: number // minutes
  lastSeen: string
}

interface Task {
  id: string
  name: string
  agentId: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  progress: number // 0-100
  priority: 'low' | 'normal' | 'high'
  error?: string
}

interface PerformanceData {
  tokenUsage: number
  latency: number // ms
  cost: number // dollars
  successRate: number // percentage
}

interface ActivityLogEntry {
  id: string
  timestamp: string
  agentId: string
  action: string
  details: string
  level: 'info' | 'warning' | 'error'
}

interface Filters {
  status: 'all' | 'queued' | 'running' | 'completed' | 'failed'
  search: string
  model: 'all' | string
}

export default App