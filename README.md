# App Hub Agent Management Dashboard

A real-time dashboard for monitoring and controlling AI agents in the App Hub software factory.

## Features
- Real-time agent status monitoring
- Task queue management with progress tracking
- Performance metrics (token usage, latency, cost, success rate)
- Activity logging with filtering
- Agent/Task controls (start, stop, pause, restart)
- Responsive design for desktop and mobile
- Accessible UI (WCAG 2.1 AA)

## Tech Stack
- Frontend: React + TypeScript + TailwindCSS
- Backend: Node.js + Express (mock API for demonstration)
- Build: Vite

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the application:
   ```bash
   # Terminal 1: Start mock API
   npm start
   
   # Terminal 2: Start frontend
   npm run dev
   ```
   - Backend API: http://localhost:5001
   - Frontend: http://localhost:5173

## API Endpoints (Mock)
- GET `/api/agents` - List all agents
- GET `/api/tasks` - Get task queue
- GET `/api/performance` - Get performance metrics
- GET `/api/activity` - Get activity log
- POST `/api/agents/:id/start` - Start agent
- POST `/api/agents/:id/stop` - Stop agent
- POST `/api/agents/:id/pause` - Pause agent
- POST `/api/agents/:id/restart` - Restart agent
- POST `/api/tasks/:id/status` - Update task status

## License
MIT