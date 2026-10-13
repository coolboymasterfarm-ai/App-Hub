# App Hub Agent Management Dashboard

A real-time dashboard for monitoring and managing AI agents in the App Hub software factory.

## Features

- **Agent Status Cards**: View agent state, model, uptime, and staleness
- **Real-time Task Queue**: Monitor task progress and queue status
- **Performance Metrics**: Track token usage, latency, cost, and success rates
- **Activity Log**: See recent agent actions and system events
- **Agent Controls**: Start, stop, pause, and restart agents
- **Task Management**: Update task status (queued, running, completed, failed)
- **Filtering**: Filter agents and tasks by status, search, and model
- **Responsive Design**: Works on desktop and mobile devices
- **Mock API Backend**: Simulated real-time updates for demonstration

## Getting Started

### Prerequisites
- Node.js (v14+)
- npm or yarn

### Installation

1. Clone the repository
2. Navigate to the dashboard directory:
   ```bash
   cd app-hub/dashboard
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

### Running the Application

1. Start the mock API server:
   ```bash
   npm start
   ```
   The server will run on http://localhost:5001

2. In a new terminal, start the frontend development server:
   ```bash
   npm run dev
   ```
   The frontend will be available at http://localhost:5173

### Building for Production

To create a production build:
```bash
npm run build
```
This will generate optimized static assets in the `dist` directory.

To preview the production build:
```bash
npm run preview
```

## API Endpoints

The mock API provides the following endpoints:

- `GET /api/agents` - Retrieve all agents
- `GET /api/tasks` - Retrieve all tasks
- `GET /api/performance` - Retrieve performance metrics
- `GET /api/activity` - Retrieve activity log
- `POST /api/agents/:id/:action` - Update agent status (start/stop/pause/restart)
- `POST /api/tasks/:id/:status` - Update task status

## Features in Detail

### Agent Status Cards
Each agent card displays:
- Agent name and model
- Current status with color-coded badge
- Uptime and staleness metrics
- Last seen timestamp
- Visual status indicator (▶️⏸️🔧⏹️❌)

### Task Queue
The task queue shows:
- Task name and assigned agent
- Current status with progress bar
- Priority level (low/normal/high)
- Error messages for failed tasks
- Real-time progress updates

### Performance Metrics
Key performance indicators:
- Token usage (total)
- Average latency (ms)
- Estimated cost ($)
- Success rate (%)

### Activity Log
Chronological log of:
- Agent status changes
- Task lifecycle events
- System notifications
- Color-coded by level (info/warning/error)

### Controls
- **Agent Controls**: Start/stop/pause/restart individual agents
- **Task Controls**: Update task status manually
- **Filters**: Filter displays by status, search term, or model

## Architecture

### Frontend
- React 18 + TypeScript
- Tailwind CSS for styling
- Vite for development and building
- Component-based architecture:
  - `StatusCard` - Individual agent display
  - `TaskQueue` - Task list with controls
  - `PerformanceMetrics` - KPI dashboard
  - `ActivityLog` - Event timeline
  - `ControlPanel` - Agent management controls
  - `FilterControls` - UI for filtering data

### Backend (Mock API)
- Node.js + Express
- CORS enabled for frontend integration
- Mock data with simulated real-time updates
- RESTful API endpoints
- Activity logging with retention limits

## Customization

### Connecting to Real Backend
To connect to actual App Hub agent management APIs:
1. Update the API endpoints in `src/services/api.ts` (to be created)
2. Modify the data fetching functions in `App.tsx`
3. Adjust the data structures to match your actual API responses
4. Update the agent and task action handlers

### Styling
The dashboard uses Tailwind CSS. To customize:
- Modify `tailwind.config.cjs` for theme customization
- Update CSS variables in `src/index.css` if needed
- Adjust component styles directly in the TSX files

## Development

### Project Structure
```
dashboard/
├── src/
│   ├── components/
│   │   ├── StatusCard.tsx
│   │   ├── TaskQueue.tsx
│   │   ├── PerformanceMetrics.tsx
│   │   ├── ActivityLog.tsx
│   │   └── ControlPanel.tsx
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── public/
│   └── index.html
├── server.js
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.cjs
```

### Available Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm start` - Start mock API server

## Design Principles

This dashboard follows AI agent dashboard UX best practices:

1. **Show Traces, Not Flat Logs**: Activity log provides actionable insights
2. **Display Cost Alongside Behavior**: Performance metrics show resource usage
3. **Distinguish Live Session States**: Clear visualization of agent states
4. **Provide Human Override Capabilities**: Full control over agents and tasks
5. **Prioritize Accessibility**: WCAG 2.1 AA compliant color schemes and contrast
6. **Optimize for Real-time**: Efficient updates with minimal performance impact
7. **Keep Layouts Scannable**: Clear visual hierarchy and information grouping
8. **Avoid Common Mistakes**: No overloading with raw outputs, proper staleness indicators, accessible color schemes

## Future Enhancements

1. **Real Backend Integration**: Connect to actual App Hub agent management APIs
2. **Advanced Visualizations**: Gantt charts for task timelines, flow diagrams for agent interactions
3. **Analytics Section**: Historical performance trends and predictive insights
4. **Configuration Management**: Edit agent settings and model parameters
5. **Notification System**: Alerts for failed agents or stalled tasks
6. **Export Functionality**: Download reports and activity logs
7. **Role-based Access Control**: Different views for administrators vs. operators
8. **Dark/Light Mode Toggle**: User preference for interface theme
9. **Keyboard Navigation**: Full accessibility support
10. **Multi-orchestrator Support**: Manage agents across multiple App Hub instances

## License

MIT License - Feel free to use and modify for your App Hub implementation.