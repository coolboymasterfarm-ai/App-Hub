const GrammarService = require('./grammarService');

describe('GrammarService', () => {
  let grammarService;

  beforeEach(() => {
    // Mock axios
    jest.mock('axios');
    const axios = require('axios');
    grammarService = new GrammarService();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('checkGrammar', () => {
    it('should call LanguageTool API with correct parameters', async () => {
      const mockResponse = { data: { matches: [] } };
      require('axios').post.mockResolvedValue(mockResponse);

      await grammarService.checkGrammar('Test text', 'en-US');

      expect(require('axios').post).toHaveBeenCalledWith(
        'http://localhost:8010/v2/check',
        expect.any(URLSearchParams),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
    });

    it('should return grammar check results', async () => {
      const mockResponse = { data: { matches: [{ message: 'Test error' }] } };
      require('axios').post.mockResolvedValue(mockResponse);

      const result = await grammarService.checkGrammar('Test text');
      expect(result).toEqual({ matches: [{ message: 'Test error' }] });
    });
  });

  describe('detectTone', () => {
    it('should call Hugging Face API when API key is available', async () => {
      process.env.HUGGINGFACE_API_KEY = 'test-key';
      const mockResponse = { data: [[{ label: '5 stars', score: 0.9 }]] };
      require('axios').post.mockResolvedValue(mockResponse);

      await grammarService.detectTone('Test text');

      expect(require('axios').post).toHaveBeenCalledWith(
        'https://api-inference.huggingface.co/models/nlptown/bert-base-multilingual-uncased-sentiment',
        { inputs: 'Test text' },
        {
          headers: {
            Authorization: 'Bearer test-key',
            'Content-Type': 'application/json'
          }
        }
      );
    });

    it('should fall back to rule-based detection when no API key', async () => {
      delete process.env.HUGGINGFACE_API_KEY;
      // Mock the fallback method
      grammarService._detectToneRuleBased = jest.fn().mockReturnValue({ tone: 'neutral', confidence: 0.6 });

      await grammarService.detectTone('Test text');

      expect(grammarService._detectToneRuleBased).toHaveBeenCalledWith('Test text');
    });
  });

  describe('getClaritySuggestions', () => {
    it('should try Hugging Face API when API key is available', async () => {
      process.env.HUGGINGFACE_API_KEY = 'test-key';
      const mockResponse = { data: [{ generated_text: 'Improved text' }] };
      require('axios').post.mockResolvedValue(mockResponse);

      await grammarService.getClaritySuggestions('Test text');

      expect(require('axios').post).toHaveBeenCalledWith(
        'https://api-inference.huggingface.co/models/facebook/bart-large-cnn',
        { inputs: 'Improve clarity: Test text' },
        {
          headers: {
            Authorization: 'Bearer test-key',
            'Content-Type': 'application/json'
          }
        }
      );
    });
  });

  describe('getVocabularySuggestions', () => {
    it('should try Hugging Face API when API key is available', async () => {
      process.env.HUGGINGFACE_API_KEY = 'test-key';
      const mockResponse = { data: [{ label: 'Use a simpler word instead of \"test\"', score: 0.8 }] };
      require('axios').post.mockResolvedValue(mockResponse);

      await grammarService.getVocabularySuggestions('Test text');

      expect(require('axios').post).toHaveBeenCalledWith(
        'https://api-inference.huggingface.co/models/facebook/bart-large-mnli',
        {
          inputs: 'Test text',
          parameters: {
            candidate_labels: [
              'Use a simpler word instead of "Test text"',
              'Keep the word "Test text"'
            ]
          }
        },
        {
          headers: {
            Authorization: 'Bearer test-key',
            'Content-Type': 'application/json'
          }
        }
      );
    });
  });
});