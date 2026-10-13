# App Hub Grammar

A Grammarly-like desktop/web application for grammar and spell checking.

## Tech Stack

- Frontend: React + TypeScript + TailwindCSS
- Backend: Node.js + Express
- NLP Engine: LanguageTool (self-hosted API)
- Optional: Hugging Face Transformers for AI-powered suggestions

## Features

### Core Features (Grammarly Free tier)
- Text input area with live grammar checking
- Spell checking with corrections
- Punctuation fixes
- Capitalization errors
- Conciseness suggestions
- Wordy phrase detection
- Document statistics (word count, reading time)
- Copy to clipboard functionality

### Premium Features (open-source alternatives)
- Tone detection (formal/informal/casual)
- Clarity suggestions
- Engagement improvements
- Delivery enhancements
- Advanced vocabulary suggestions
- Plagiarism detection (using open-source tools)
- Multi-language support (30+ languages)
- Custom dictionary

## UI Requirements
- Clean, modern interface similar to Grammarly
- Dark mode support
- Responsive design
- Accessibility (WCAG 2.2 compliant)
- Keyboard shortcuts
- Real-time feedback with inline corrections

## Project Structure

```
app-hub-grammar/
├── backend/                 # Node.js + Express server
│   ├── src/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   └── server.js
│   ├── package.json
│   └── .env.example
├── frontend/                # React + TypeScript + TailwindCSS
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── styles/
│   │   ├── types/
│   │   ├── App.tsx
│   │   └── index.tsx
│   ├── package.json
│   ├── tailwind.config.js
│   └── postcss.config.js
├── docker-compose.yml       # For self-hosting LanguageTool
└── README.md
```

## Setup Instructions

### Prerequisites
- Node.js (v18+)
- npm or yarn
- Docker (for LanguageTool self-hosting, optional)

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

### LanguageTool Self-Hosting (Optional but Recommended for Production)

We provide a Docker Compose file to run LanguageTool locally:

```bash
docker-compose up -d languagetool
```

This will start LanguageTool on `http://localhost:8010`.

### Environment Variables

Backend `.env` variables:
- `PORT`: Port for the Express server (default: 5000)
- `LANGUAGETOOL_URL`: URL of the LanguageTool API (default: http://localhost:8010/v2)
- `HUGGINGFACE_API_KEY`: Optional API key for Hugging Face models
- `NODE_ENV`: Environment (development/production)

### Building for Production

1. Build the frontend:
   ```bash
   cd frontend
   npm run build
   ```

2. Start the backend in production mode:
   ```bash
   cd ../backend
   npm start
   ```

The application will be available at `http://localhost:5000` (serving the frontend build).

## API Endpoints

### Backend (`/api`)
- `POST /check` - Check text for grammar, spelling, and style issues
- `POST /tone` - Detect tone of the text
- `POST /clarity` - Get clarity suggestions
- `POST /engagement` - Get engagement improvements
- `POST /delivery` - Get delivery enhancements
- `POST /vocabulary` - Get advanced vocabulary suggestions
- `POST /plagiarism` - Check for plagiarism (requires external service)
- `POST /languages` - Get supported languages
- `POST /dictionary` - Manage custom dictionary

## Implementation Notes

### LanguageTool Integration
The backend acts as a proxy to LanguageTool's HTTP API. We use the `/v2/check` endpoint for grammar and spelling checks.

### Hugging Face Integration
For premium features, we optionally use Hugging Face's inference API for:
- Tone detection: `nlptown/bert-base-multilingual-uncased-sentiment`
- Text generation for suggestions: Various models
- Embeddings for similarity checks: `sentence-transformers/all-MiniLM-L6-v2`

### Real-time Checking
The frontend debounces text input and sends requests to the backend every 500ms to avoid excessive API calls.

### UI Components
- `TextEditor`: Main component with textarea and suggestion overlay
- `SuggestionList`: Displays list of suggestions with accept/reject actions
- `StatisticsPanel`: Shows word count, reading time, etc.
- `Toolbar`: Contains format buttons, language selector, and mode toggles
- `SettingsModal`: For custom dictionary, language preferences, etc.

## Accessibility
- All interactive elements are keyboard navigable
- Sufficient color contrast (WCAG 2.2 AA)
- ARIA labels for screen readers
- Focus management for modal dialogs
- Responsive design for mobile and tablet

## Keyboard Shortcuts
- `Ctrl+;` - Open/close suggestion panel
- `Ctrl+Shift+C` - Copy corrected text
- `Ctrl+Shift+S` - Open settings
- `Ctrl+Shift+D` - Toggle dark mode

## Contributing
Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License
This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.