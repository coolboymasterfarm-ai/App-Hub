# Writing Assistant

A writing assistant app that uses your FreeLLM API to provide grammar, spelling, punctuation, style, and tone suggestions.

## Features

- Real-time writing analysis using your FreeLLM API
- Categorized suggestions (Grammar, Spelling, Punctuation, Style, Tone, Vocabulary, Clarity)
- Interactive interface to apply or ignore suggestions
- Preview of corrected text
- Copy corrected text to clipboard
- Download corrected text as .txt file
- Character and word counting
- Responsive design
- Error handling and loading states

## How It Works

1. Paste or type your writing in the text area
2. Click "Check Writing" button
3. The app sends your text to your FreeLLM API endpoint
4. Receive categorized suggestions with highlighted issues
5. Apply suggestions individually or all at once
6. Preview the corrected text
7. Copy or download the corrected text

## Setup

### Configuration

The app needs to know your FreeLLM API endpoint. It can be configured in three ways (in order of priority):

1. **Global Variable** (Recommended for App Hub integration):
   ```javascript
   window.FREELLM_ENDPOINT = 'https://your-freellm-api-endpoint.com/check';
   ```

2. **Local Storage**:
   ```javascript
   localStorage.setItem('freellmEndpoint', 'https://your-freellm-api-endpoint.com/check');
   ```

3. **Default Fallback** (for development only):
   Edit the `getEndpoint()` method in `freellm.js` to return your endpoint.

### Installation

1. Clone or copy this repository to your desired location
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the App

#### As a standalone web app:
```bash
npm run dev
```
Then open http://localhost:3000 in your browser

#### As an Electron app (for App Hub integration):
```bash
npm run start
```

## Integration with App Hub

This writing assistant is designed to be integrated into your App Hub repository. To add it:

1. Copy the `writing-assistant/` folder to your App Hub repository (e.g., `apps/writing-assistant/`)
2. Ensure your FreeLLM endpoint is configured (see Configuration above)
3. Follow your App Hub's process for adding new applications
4. The app should appear as a tab in your App Hub interface

## Development Process

This app was built using a phased approach:

1. **Phase 0**: Preparation and setup
2. **Phase 1**: Basic UI skeleton
3. **Phase 2**: FreeLLM API integration
4. **Phase 3**: Enhanced features (suggestions, apply/copy/download)
5. **Phase 4**: Polish & testing (error handling, UX improvements)
6. **Phase 5**: Final integration & release

Each phase was designed to be verifiable in the browser before proceeding to the next.

## File Structure

```
writing-assistant/
├── index.html          # Main HTML structure
├── style.css           # Styling
├── freellm.js          # FreeLLM API service
├── renderer.js         # Main application logic
├── package.json        # npm configuration and scripts
└── README.md           # This file
```

## API Expectations

The app expects your FreeLLM API to:
- Accept POST requests with JSON body: `{ "text": "your text here" }`
- Return JSON response with writing suggestions
- The app will attempt to parse and categorize the response

If your API returns a different format, you may need to adjust the `parseResponse()` and `categorizeSuggestions()` methods in `freellm.js`.

## Customization

You can customize the app by modifying:
- `style.css`: Change colors, fonts, spacing
- `index.html`: Modify structure or add elements
- `freellm.js`: Adjust API endpoint handling or response parsing
- `renderer.js`: Change interaction logic or add features

## License

MIT