const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Mock data
let agents = [
  { id: '1', name: 'Research Agent', status: 'running', uptime: '2h 15m', 
    availableActions: ['pause', 'restart'], currentTask: 'Research UI/UX best practices' },
  { id: '2', name: 'Engineer Agent', status: 'paused', uptime: '45m', 
    availableActions: ['start', 'restart'], currentTask: 'Build agent monitoring API' },
  { id: '3', name: 'QA Tester Agent', status: 'running', uptime: '1h 30m', 
    availableActions: ['pause', 'restart'], currentTask: 'Test dashboard responsiveness' },
  { id: '4', name: 'Designer Agent', status: 'error', uptime: '0', 
    availableActions: ['restart'], currentTask: null, error: 'Validation failed in step 3' },
  { id: '5', name: 'Reviewer Agent', status: 'idle', uptime: '3h 0m', 
    availableActions: ['start'], currentTask: null }
];

let tasks = [
  { id: '1', title: 'Research UI/UX best practices', agentName: 'Research Agent', 
    status: 'completed', progress: 100, priority: 'high', model: 'claude-3', createdAt: '2026-10-12T12:00:00Z' },
  { id: '2', title: 'Design dashboard layout', agentName: 'Designer Agent', 
    status: 'paused', progress: 60, priority: 'medium', model: 'gpt-4', createdAt: '2026-10-12T12:30:00Z' },
  { id: '3', title: 'Build agent monitoring API', agentName: 'Engineer Agent', 
    status: 'running', progress: 35, priority: 'high', model: 'claude-3', createdAt: '2026-10-12T13:00:00Z' },
  { id: '4', title: 'Test dashboard responsiveness', agentName: 'QA Tester Agent', 
    status: 'queued', progress: 0, priority: 'low', model: 'gpt-4', createdAt: '2026-10-12T13:30:00Z' },
  { id: '5', title: 'Review code quality', agentName: 'Reviewer Agent', 
    status: 'completed', progress: 100, priority: 'medium', model: 'claude-3', createdAt: '2026-10-12T14:00:00Z' }
];

let activity = [
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
];

let performance = {
  tokenUsage: '1.2M',
  avgLatency: '245ms',
  successRate: '98.7%',
  cost: '$23.45',
  requestsPerMinute: '45',
  errorRate: '1.3%'
};

// Helper to generate timestamp
const getTimestamp = () => {
  const now = new Date();
  return now.toLocaleString().replace(/T/, ' ').replace(/\..+/, '');
};

// API Routes
app.get('/api/agents', (req, res) => {
  res.json(agents);
});

app.get('/api/tasks', (req, res) => {
  res.json(tasks);
});

app.get('/api/activity', (req, res) => {
  res.json(activity);
});

app.get('/api/performance', (req, res) => {
  res.json(performance);
});

// Agent actions
app.post('/api/agents/:id/start', (req, res) => {
  const agent = agents.find(a => a.id === req.params.id);
  if (agent) {
    agent.status = 'running';
    agent.uptime = '0m';
    agent.availableActions = ['pause', 'restart'];
    activity.unshift({
      id: activity.length + 1,
      timestamp: getTimestamp(),
      level: 'info',
      message: `${agent.name} started`
    });
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Agent not found' });
  }
});

app.post('/api/agents/:id/stop', (req, res) => {
  const agent = agents.find(a => a.id === req.params.id);
  if (agent) {
    agent.status = 'idle';
    agent.availableActions = ['start'];
    activity.unshift({
      id: activity.length + 1,
      timestamp: getTimestamp(),
      level: 'info',
      message: `${agent.name} stopped`
    });
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Agent not found' });
  }
});

app.post('/api/agents/:id/pause', (req, res) => {
  const agent = agents.find(a => a.id === req.params.id);
  if (agent && agent.status === 'running') {
    agent.status = 'paused';
    agent.availableActions = ['start', 'restart'];
    activity.unshift({
      id: activity.length + 1,
      timestamp: getTimestamp(),
      level: 'warning',
      message: `${agent.name} paused`
    });
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Cannot pause agent' });
  }
});

app.post('/api/agents/:id/restart', (req, res) => {
  const agent = agents.find(a => a.id === req.params.id);
  if (agent) {
    // Reset agent state
    agent.status = 'idle';
    agent.uptime = '0m';
    agent.currentTask = null;
    agent.error = null;
    agent.availableActions = ['start'];
    
    activity.unshift({
      id: activity.length + 1,
      timestamp: getTimestamp(),
      level: 'info',
      message: `${agent.name} restarted`
    });
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Agent not found' });
  }
});

// Task actions
app.post('/api/tasks/:id/status', (req, res) => {
  const task = tasks.find(t => t.id === req.params.id);
  if (task) {
    const oldStatus = task.status;
    task.status = req.body.status;
    
    // Update progress based on status
    if (req.body.status === 'completed') {
      task.progress = 100;
    } else if (req.body.status === 'failed') {
      task.progress = 0;
    }
    
    activity.unshift({
      id: activity.length + 1,
      timestamp: getTimestamp(),
      level: req.body.status === 'completed' ? 'success' : 
             req.body.status === 'failed' ? 'error' : 'info',
      message: `${task.agentName} task "${task.title}" ${req.body.status}`
    });
    
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Task not found' });
  }
});

// Update task progress (for demo)
app.post('/api/tasks/:id/progress', (req, res) => {
  const task = tasks.find(t => t.id === req.params.id);
  if (task) {
    task.progress = Math.min(100, Math.max(0, req.body.progress));
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Task not found' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Mock API server running on http://localhost:${PORT}`);
});

module.exports = app;