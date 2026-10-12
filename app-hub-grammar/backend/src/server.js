const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const grammarService = require('./services/grammarService');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'App Hub Grammar API is running' });
});

// Grammar checking route
app.post('/api/check', async (req, res) => {
  try {
    const { text, language = 'en-US' } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required and must be a string' });
    }

    const result = await grammarService.checkGrammar(text, language);
    res.json(result);
  } catch (error) {
    console.error('Grammar check error:', error);
    res.status(500).json({ 
      error: 'Failed to check grammar',
      details: error.message 
    });
  }
});

// Tone detection route
app.post('/api/tone', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required and must be a string' });
    }

    const result = await grammarService.detectTone(text);
    res.json(result);
  } catch (error) {
    console.error('Tone detection error:', error);
    res.status(500).json({ error: 'Tone detection failed' });
  }
});

// Clarity suggestions route
app.post('/api/clarity', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required and must be a string' });
    }

    const result = await grammarService.getClaritySuggestions(text);
    res.json(result);
  } catch (error) {
    console.error('Clarity suggestions error:', error);
    res.status(500).json({ error: 'Clarity suggestions failed' });
  }
});

// Engagement improvements route
app.post('/api/engagement', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required and must be a string' });
    }

    const result = await grammarService.getEngagementSuggestions(text);
    res.json(result);
  } catch (error) {
    console.error('Engagement suggestions error:', error);
    res.status(500).json({ error: 'Engagement suggestions failed' });
  }
});

// Delivery enhancements route
app.post('/api/delivery', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required and must be a string' });
    }

    const result = await grammarService.getDeliverySuggestions(text);
    res.json(result);
  } catch (error) {
    console.error('Delivery suggestions error:', error);
    res.status(500).json({ error: 'Delivery suggestions failed' });
  }
});

// Advanced vocabulary suggestions route
app.post('/api/vocabulary', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required and must be a string' });
    }

    const result = await grammarService.getVocabularySuggestions(text);
    res.json(result);
  } catch (error) {
    console.error('Vocabulary suggestions error:', error);
    res.status(500).json({ error: 'Vocabulary suggestions failed' });
  }
});

// Plagiarism detection route
app.post('/api/plagiarism', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required and must be a string' });
    }

    const result = await grammarService.checkPlagiarism(text);
    res.json(result);
  } catch (error) {
    console.error('Plagiarism check error:', error);
    res.status(500).json({ error: 'Plagiarism check failed' });
  }
});

// Languages route
app.get('/api/languages', async (req, res) => {
  try {
    const result = await grammarService.getLanguages();
    res.json(result);
  } catch (error) {
    console.error('Languages fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch languages' });
  }
});

// Custom dictionary route
app.post('/api/dictionary', async (req, res) => {
  try {
    const result = await grammarService.manageDictionary(req.body);
    res.json(result);
  } catch (error) {
    console.error('Dictionary management error:', error);
    res.status(500).json({ error: 'Dictionary management failed' });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Export for testing
module.exports = app;