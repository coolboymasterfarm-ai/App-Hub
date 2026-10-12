const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Mock data
let agents = [
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
];

let tasks = [
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
];

let performanceData = {
  tokenUsage: 12450,
  latency: 145,
  cost: 0.87,
  successRate: 92.5
};

let activityLog = [
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
];

// API endpoints
app.get('/api/agents', (req, res) => {
  res.json(agents);
});

app.get('/api/tasks', (req, res) => {
  res.json(tasks);
});

app.get('/api/performance', (req, res) => {
  res.json(performanceData);
});

app.get('/api/activity', (req, res) => {
  res.json(activityLog);
});

// Update agent status
app.post('/api/agents/:id/:action', (req, res) => {
  const { id, action } = req.params;
  const agent = agents.find(a => a.id === id);
  
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  
  switch (action) {
    case 'start':
      agent.status = 'running';
      agent.lastSeen = new Date().toISOString();
      break;
    case 'stop':
      agent.status = 'stopped';
      agent.lastSeen = new Date().toISOString();
      break;
    case 'pause':
      agent.status = 'idle';
      agent.lastSeen = new Date().toISOString();
      break;
    case 'restart':
      agent.status = 'running';
      agent.uptime = 0;
      agent.lastSeen = new Date().toISOString();
      break;
    default:
      return res.status(400).json({ error: 'Invalid action' });
  }
  
  // Add to activity log
  activityLog.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    agentId: id,
    action: `${action.charAt(0).toUpperCase() + action.slice(1)} agent`,
    details: `Agent ${id} ${action}ed via dashboard`,
    level: 'info'
  });
  
  // Keep only last 50 entries
  if (activityLog.length > 50) {
    activityLog = activityLog.slice(0, 50);
  }
  
  res.json(agent);
});

// Update task status
app.post('/api/tasks/:id/:status', (req, res) => {
  const { id, status } = req.params;
  const task = tasks.find(t => t.id === id);
  
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  
  const validStatuses = ['queued', 'running', 'completed', 'failed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  
  task.status = status;
  if (status === 'completed') {
    task.progress = 100;
  } else if (status === 'failed') {
    task.error = 'Manually failed via dashboard';
  }
  
  // Add to activity log
  activityLog.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    agentId: task.agentId,
    action: `Task ${status.charAt(0).toUpperCase() + status.slice(1)}d`,
    details: `Task "${task.name}" was ${status}ed via dashboard`,
    level: 'info'
  });
  
  // Keep only last 50 entries
  if (activityLog.length > 50) {
    activityLog = activityLog.slice(0, 50);
  }
  
  res.json(task);
});

// Simulate real-time updates
setInterval(() => {
  // Update agent data
  agents.forEach(agent => {
    if (agent.status === 'running') {
      agent.uptime += 5;
      agent.staleness = Math.max(0, agent.staleness - Math.random() * 2);
      agent.lastSeen = new Date(Date.now() - Math.random() * 30000).toISOString();
      
      // Randomly change status occasionally
      if (Math.random() > 0.95) {
        const statuses = ['running', 'idle'];
        agent.status = statuses[Math.floor(Math.random() * statuses.length)];
      }
    }
  });
  
  // Update task progress
  tasks.forEach(task => {
    if (task.status === 'running') {
      task.progress = Math.min(100, task.progress + Math.random() * 10);
      if (task.progress >= 100) {
        task.status = 'completed';
      }
    }
  });
  
  // Update performance metrics
  performanceData.tokenUsage += Math.floor(Math.random() * 150);
  performanceData.latency = Math.max(50, performanceData.latency + (Math.random() - 0.5) * 20);
  performanceData.cost += Math.random() * 0.002;
  performanceData.successRate = Math.min(100, Math.max(0, performanceData.successRate + (Math.random() - 0.5) * 2));
  
  // Add occasional activity log entries
  if (Math.random() > 0.7) {
    const agentIds = ['agent-1', 'agent-2', 'agent-3'];
    const actions = ['Started task', 'Completed task', 'Failed task', 'Retrying'];
    const details = ['Processing user request', 'Waiting for input', 'Generating output', 'Analyzing data'];
    
    activityLog.unshift({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      agentId: agentIds[Math.floor(Math.random() * agentIds.length)],
      action: actions[Math.floor(Math.random() * actions.length)],
      details: details[Math.floor(Math.random() * details.length)],
      level: Math.random() > 0.8 ? 'error' : Math.random() > 0.6 ? 'warning' : 'info'
    });
    
    // Keep only last 50 entries
    if (activityLog.length > 50) {
      activityLog = activityLog.slice(0, 50);
    }
  }
}, 5000);

app.listen(PORT, () => {
  console.log(`Mock API server running on http://localhost:${PORT}`);
});