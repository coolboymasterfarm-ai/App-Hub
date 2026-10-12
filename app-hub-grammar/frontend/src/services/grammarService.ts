import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

class GrammarService {
  /**
   * Check text for grammar, spelling, and style issues
   * @param {string} text - The text to check
   * @param {string} language - Language code (default: en-US)
   * @returns {Promise<any>} Grammar check results
   */
  async checkGrammar(text: string, language: string = 'en-US') {
    try {
      const response = await axios.post(`${API_BASE_URL}/check`, {
        text,
        language
      });
      return response.data;
    } catch (error) {
      console.error('Grammar check failed:', error);
      throw error;
    }
  }

  /**
   * Detect tone of text
   * @param {string} text - Text to analyze
   * @returns {Promise<any>} Tone analysis result
   */
  async detectTone(text: string) {
    try {
      const response = await axios.post(`${API_BASE_URL}/tone`, {
        text
      });
      return response.data;
    } catch (error) {
      console.error('Tone detection failed:', error);
      throw error;
    }
  }

  /**
   * Get clarity suggestions
   * @param {string} text - Text to analyze
   * @returns {Promise<any>} Clarity suggestions
   */
  async getClaritySuggestions(text: string) {
    try {
      const response = await axios.post(`${API_BASE_URL}/clarity`, {
        text
      });
      return response.data;
    } catch (error) {
      console.error('Clarity suggestions failed:', error);
      throw error;
    }
  }

  /**
   * Get engagement improvements
   * @param {string} text - Text to analyze
   * @returns {Promise<any>} Engagement suggestions
   */
  async getEngagementSuggestions(text: string) {
    try {
      const response = await axios.post(`${API_BASE_URL}/engagement`, {
        text
      });
      return response.data;
    } catch (error) {
      console.error('Engagement suggestions failed:', error);
      throw error;
    }
  }

  /**
   * Get delivery enhancements
   * @param {string} text - Text to analyze
   * @returns {Promise<any>} Delivery suggestions
   */
  async getDeliverySuggestions(text: string) {
    try {
      const response = await axios.post(`${API_BASE_URL}/delivery`, {
        text
      });
      return response.data;
    } catch (error) {
      console.error('Delivery suggestions failed:', error);
      throw error;
    }
  }

  /**
   * Get advanced vocabulary suggestions
   * @param {string} text - Text to analyze
   * @returns {Promise<any>} Vocabulary suggestions
   */
  async getVocabularySuggestions(text: string) {
    try {
      const response = await axios.post(`${API_BASE_URL}/vocabulary`, {
        text
      });
      return response.data;
    } catch (error) {
      console.error('Vocabulary suggestions failed:', error);
      throw error;
    }
  }

  /**
   * Check for plagiarism
   * @param {string} text - Text to check
   * @returns {Promise<any>} Plagiarism check result
   */
  async checkPlagiarism(text: string) {
    try {
      const response = await axios.post(`${API_BASE_URL}/plagiarism`, {
        text
      });
      return response.data;
    } catch (error) {
      console.error('Plagiarism check failed:', error);
      throw error;
    }
  }

  /**
   * Get supported languages
   * @returns {Promise<any>} List of supported languages
   */
  async getLanguages() {
    try {
      const response = await axios.get(`${API_BASE_URL}/languages`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch languages:', error);
      throw error;
    }
  }

  /**
   * Manage custom dictionary
   * @param {Object} action - Dictionary action to perform
   * @returns {Promise<any>} Result of dictionary operation
   */
  async manageDictionary(action: any) {
    try {
      const response = await axios.post(`${API_BASE_URL}/dictionary`, action);
      return response.data;
    } catch (error) {
      console.error('Dictionary management failed:', error);
      throw error;
    }
  }
}

export const grammarService = new GrammarService();