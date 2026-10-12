# App Hub - Open Source Grammarly Clone

A real-time writing assistant that checks grammar, spelling, and style using the LanguageTool API.

## Features

- Real-time grammar and spelling checking with debounce
- Error highlighting in text
- One-click apply suggestions
- Tone detection
- Word/character/sentence/paragraph counting
- Dark mode support
- Clean, modern UI with Tailwind CSS

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express
- **NLP**: LanguageTool API (public: https://api.languagetool.org/v2/check)

## Project Structure

```
app-hub/
├── server/
│   └── index.js          # Express backend
├── client/
│   ├── public/
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── hooks/        # Custom React hooks
│   │   ├── services/     # API services
│   │   ├── types/        # TypeScript types
│   │   ├── App.tsx       # Main app component
│   │   ├── main.tsx      # Entry point
│   │   └── index.css     # Tailwind styles
│   ├── package.json      # Frontend dependencies
│   ├── vite.config.ts    # Vite configuration
│   ├── tailwind.config.js # Tailwind configuration
│   └── postcss.config.js # PostCSS configuration
├── package.json          # Root package with scripts
└── README.md
```

## Setup

1. Install dependencies:
   ```bash
   npm run install:all
   ```

2. Start the development servers:
   ```bash
   npm run dev
   ```

   This will start:
   - Backend server on http://localhost:5000
   - Frontend Vite dev server on http://localhost:3000

## API Endpoints

### Grammar Check
- **POST** `/api/check`
- Body: `{ "text": "your text here" }`
- Returns: LanguageTool API response with grammar suggestions

### Writing Statistics
- **POST** `/api/stats`
- Body: `{ "text": "your text here" }`
- Returns: `{ words, characters, sentences, paragraphs }`

### Health Check
- **GET** `/api/health`
- Returns: `{ status: 'ok', message: 'Grammarly clone API is running' }`

## Building for Production

```bash
npm run build
```

This will:
1. Build the React frontend (output to `client/dist/`)
2. Prepare the Express server to serve static files

To start the production server:
```bash
npm start
```

## Environment Variables

The application can be configured using environment variables:

- `PORT`: Server port (default: 5000)
- `NODE_ENV`: Environment (development/production)

## How It Works

1. User types in the editor component
2. Text changes trigger a debounced API call to `/api/check`
3. The backend forwards the request to LanguageTool API
4. Results are displayed in the results panel with suggestions
5. Users can click on highlighted errors to see suggestions
6. One-click apply functionality replaces text with selected suggestion

## LanguageTool API

This application uses the public LanguageTool API at:
https://api.languagetool.org/v2/check

No API key is required for basic usage, but for high-volume applications, consider getting your own API key or self-hosting LanguageTool.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing-feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [LanguageTool](https://languagetool.org/) for the powerful grammar checking API
- [React](https://reactjs.org/) for the frontend library
- [Vite](https://vitejs.dev/) for the fast development server
- [Tailwind CSS](https://tailwindcss.com/) for the utility-first CSS framework