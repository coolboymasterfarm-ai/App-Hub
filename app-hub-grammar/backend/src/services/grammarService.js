const axios = require('axios');

class GrammarService {
  constructor() {
    this.languagetoolUrl = process.env.LANGUAGETOOL_URL || 'http://localhost:8010/v2';
    this.huggingfaceApiKey = process.env.HUGGINGFACE_API_KEY;
    this.hfApiUrl = 'https://api-inference.huggingface.co/models';
  }

  /**
   * Check text for grammar, spelling, and style issues
   * @param {string} text - The text to check
   * @param {string} language - Language code (default: en-US)
   * @returns {Promise<Object>} LanguageTool response
   */
  async checkGrammar(text, language = 'en-US') {
    try {
      const response = await axios.post(`${this.languagetoolUrl}/check`, 
        new URLSearchParams({
          text: text,
          language: language,
          enabledOnly: false
        }), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      return response.data;
    } catch (error) {
      throw new Error(`Grammar check failed: ${error.message}`);
    }
  }

  /**
   * Get supported languages from LanguageTool
   * @returns {Promise<Array>} List of supported languages
   */
  async getLanguages() {
    try {
      const response = await axios.get(`${this.languagetoolUrl}/languages`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch languages: ${error.message}`);
    }
  }

  /**
   * Detect tone of text using Hugging Face API or rule-based fallback
   * @param {string} text - Text to analyze
   * @returns {Promise<Object>} Tone analysis result
   */
  async detectTone(text) {
    // If Hugging Face API key is available, use it
    if (this.huggingfaceApiKey) {
      try {
        const response = await axios.post(
          `${this.hfApiUrl}/nlptown/bert-base-multilingual-uncased-sentiment`,
          { inputs: text },
          {
            headers: {
              Authorization: `Bearer ${this.huggingfaceApiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        // Process the response to map to tone categories
        const results = response.data[0] || [];
        const toneMap = {
          '1 star': 'very_negative',
          '2 stars': 'negative', 
          '3 stars': 'neutral',
          '4 stars': 'positive',
          '5 stars': 'very_positive'
        };
        
        const topResult = results.reduce((prev, current) => 
          (prev.score > current.score) ? prev : current
        );
        
        return {
          tone: toneMap[topResult.label] || 'neutral',
          confidence: topResult.score,
          details: `Detected as ${topResult.label} sentiment`,
          allScores: results.map(r => ({
            label: r.label,
            score: r.score,
            tone: toneMap[r.label] || 'neutral'
          }))
        };
      } catch (error) {
        console.warn('Hugging Face tone detection failed, falling back to rule-based:', error.message);
        // Fall through to rule-based approach
      }
    }
    
    // Rule-based fallback for tone detection
    return this._detectToneRuleBased(text);
  }

  /**
   * Get clarity suggestions using rule-based and optional HF enhancement
   * @param {string} text - Text to analyze
   * @returns {Promise<Object>} Clarity suggestions
   */
  async getClaritySuggestions(text) {
    // Try Hugging Face for text improvement if API key available
    if (this.huggingfaceApiKey) {
      try {
        // Use a text generation model for paraphrasing/clarity
        const response = await axios.post(
          `${this.hfApiUrl}/facebook/bart-large-cnn`,
          { inputs: `Improve clarity: ${text}` },
          {
            headers: {
              Authorization: `Bearer ${this.huggingfaceApiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        const improvedText = response.data[0]?.generated_text || text;
        if (improvedText !== text && improvedText.trim()) {
          return {
            suggestions: [{
              original: text,
              suggested: improvedText,
              reason: 'Improved clarity and conciseness',
              confidence: 0.8
            }],
            message: 'AI-powered clarity suggestions generated'
          };
        }
      } catch (error) {
        console.warn('Hugging Face clarity failed, using rule-based:', error.message);
      }
    }
    
    // Rule-based clarity suggestions
    return this._getClaritySuggestionsRuleBased(text);
  }

  /**
   * Get engagement improvements using rule-based approaches
   * @param {string} text - Text to analyze
   * @returns {Promise<Object>} Engagement suggestions
   */
  async getEngagementSuggestions(text) {
    // Rule-based engagement improvements
    return this._getEngagementSuggestionsRuleBased(text);
  }

  /**
   * Get delivery enhancements using rule-based approaches
   * @param {string} text - Text to analyze
   * @returns {Promise<Object>} Delivery suggestions
   */
  async getDeliverySuggestions(text) {
    // Rule-based delivery enhancements
    return this._getDeliverySuggestionsRuleBased(text);
  }

  /**
   * Get advanced vocabulary suggestions using Hugging Face or rule-based
   * @param {string} text - Text to analyze
   * @returns {Promise<Object>} Vocabulary suggestions
   */
  async getVocabularySuggestions(text) {
    // Try Hugging Face for vocabulary enhancement if API key available
    if (this.huggingfaceApiKey) {
      try {
        // Use a fill-mask model or similar for word suggestions
        // For simplicity, we'll identify complex words and suggest simpler alternatives
        const words = text.split(/\s+/);
        const suggestions = [];
        
        // Check a few words for synonyms (limited to avoid API overload)
        for (let i = 0; i < Math.min(3, words.length); i++) {
          const word = words[i].replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');
          if (word.length > 5) { // Only suggest for longer words
            try {
              const response = await axios.post(
                `${this.hfApiUrl}/facebook/bart-large-mnli`,
                {
                  inputs: text,
                  parameters: {
                    candidate_labels: [`Use a simpler word instead of "${word}"`, `Keep the word "${word}"`]
                  }
                },
                {
                  headers: {
                    Authorization: `Bearer ${this.huggingfaceApiKey}`,
                    'Content-Type': 'application/json'
                  }
                }
              );
              
              // If the model suggests changing the word, add a suggestion
              if (response.data && response.data[0] && 
                  response.data[0].label.includes('simpler word') && 
                  response.data[0].score > 0.7) {
                suggestions.push({
                  original: word,
                  suggested: this._getSimplerSynonym(word), // Simple fallback
                  reason: 'Consider a more common word for better readability',
                  confidence: response.data[0].score
                });
              }
            } catch (wordError) {
              // Continue with other words if one fails
              continue;
            }
          }
        }
        
        if (suggestions.length > 0) {
          return {
            suggestions: suggestions,
            message: 'AI-powered vocabulary suggestions generated'
          };
        }
      } catch (error) {
        console.warn('Hugging Face vocabulary failed, using rule-based:', error.message);
      }
    }
    
    // Rule-based vocabulary suggestions
    return this._getVocabularySuggestionsRuleBased(text);
  }

  /**
   * Check for plagiarism (placeholder - would require external service)
   * @param {string} text - Text to check
   * @returns {Promise<Object>} Plagiarism check result
   */
  async checkPlagiarism(text) {
    // Placeholder implementation - in reality would connect to plagiarism API
    return {
      plagiarismDetected: false,
      similarityScore: 0,
      sources: [],
      message: 'Plagiarism detection requires external service integration (like Copyscape or Turnitin API)'
    };
  }

  /**
   * Manage custom dictionary (placeholder for persistent storage)
   * @param {Object} action - Dictionary action to perform
   * @returns {Promise<Object>} Result of dictionary operation
   */
  async manageDictionary(action) {
    // Placeholder implementation - would use a database or file storage
    return {
      message: `Dictionary action '${action.type || 'unknown'}' would be implemented with persistent storage`,
      success: true
    };
  }

  // ===== RULE-BASED FALLBACK METHODS =====

  /**
   * Rule-based tone detection
   * @private
   */
  _detectToneRuleBased(text) {
    const lowerText = text.toLowerCase();
    
    // Positive indicators
    const positiveWords = ['excellent', 'great', 'amazing', 'wonderful', 'fantastic', 'love', 'like', 'enjoy', 'happy', 'pleased', 'glad', 'delighted', 'thrilled', 'outstanding', 'superb'];
    const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'hate', 'dislike', 'angry', 'frustrated', 'disappointed', 'upset', 'annoyed', 'worst', 'poor'];
    
    let positiveCount = 0;
    let negativeCount = 0;
    
    positiveWords.forEach(word => {
      if (lowerText.includes(word)) positiveCount++;
    });
    
    negativeWords.forEach(word => {
      if (lowerText.includes(word)) negativeCount++;
    });
    
    // Formality indicators
    const formalWords = ['furthermore', 'however', 'therefore', 'consequently', 'moreover', 'further', 'thus', 'hence', 'accordingly'];
    const informalWords = ['yeah', 'yep', 'nah', 'nope', 'gonna', 'wanna', 'gotta', 'kinda', 'sorta', 'lol', 'omg', 'btw', 'fyi'];
    
    let formalCount = 0;
    let informalCount = 0;
    
    formalWords.forEach(word => {
      if (lowerText.includes(word)) formalCount++;
    });
    
    informalWords.forEach(word => {
      if (lowerText.includes(word)) informalCount++;
    });
    
    // Determine tone
    let tone = 'neutral';
    let confidence = 0.6;
    
    if (formalCount > informalCount + 1) {
      tone = 'formal';
      confidence = 0.7;
    } else if (informalCount > formalCount + 1) {
      tone = 'informal';
      confidence = 0.7;
    }
    
    if (positiveCount > negativeCount + 1) {
      if (tone === 'neutral') tone = 'positive';
      confidence += 0.1;
    } else if (negativeCount > positiveCount + 1) {
      if (tone === 'neutral') tone = 'negative';
      confidence += 0.1;
    }
    
    // Cap confidence
    confidence = Math.min(0.95, confidence);
    
    return {
      tone: tone,
      confidence: confidence,
      details: `Rule-based analysis: ${positiveCount} positive, ${negativeCount} negative, ${formalCount} formal, ${informalCount} informal indicators`
    };
  }

  /**
   * Rule-based clarity suggestions
   * @private
   */
  _getClaritySuggestionsRuleBased(text) {
    const suggestions = [];
    const sentences = text.split(/[.!?]+/);
    
    sentences.forEach((sentence, index) => {
      const trimmed = sentence.trim();
      if (!trimmed) return;
      
      // Check for wordiness
      const wordyPatterns = [
        { pattern: /\b(in order to)\b/g, suggestion: 'to' },
        { pattern: /\b(due to the fact that)\b/g, suggestion: 'because' },
        { pattern: /\b(at this point in time)\b/g, suggestion: 'now' },
        { pattern: /\b(for the purpose of)\b/g, suggestion: 'for' },
        { pattern: /\b(in the event that)\b/g, suggestion: 'if' },
        { pattern: /\b(it is important to note that)\b/g, suggestion: 'note:' },
        { pattern: /\b(as a matter of fact)\b/g, suggestion: 'in fact' },
        { pattern: /\b(with respect to)\b/g, suggestion: 'about' },
        { pattern: /\b(in the process of)\b/g, suggestion: 'ing' } // Will need context
      ];
      
      let modified = trimmed;
      let hasChanges = false;
      
      wordyPatterns.forEach(patternObj => {
        if (patternObj.pattern.test(modified)) {
          modified = modified.replace(patternObj.pattern, patternObj.suggestion);
          hasChanges = true;
        }
      });
      
      // Check for passive voice (simple detection)
      const passivePatterns = [
        /\b(was|were|been|being)\s+\w+ed\b/i,
        /\b(is|are|am)\s+\w+ed\b/i
      ];
      
      let isPassive = false;
      passivePatterns.forEach(pattern => {
        if (pattern.test(trimmed)) isPassive = true;
      });
      
      if (hasChanges || isPassive) {
        suggestions.push({
          original: trimmed,
          suggested: hasChanges ? modified : `Consider making this more active: "${trimmed}"`,
          reason: hasChanges ? 'Wordy phrase detected' : 'Possible passive voice',
          confidence: 0.7
        });
      }
    });
    
    return {
      suggestions: suggestions.slice(0, 5), // Limit to 5 suggestions
      message: suggestions.length > 0 
        ? `Found ${suggestions.length} clarity improvement(s)` 
        : 'No clarity issues detected'
    };
  }

  /**
   * Rule-based engagement suggestions
   * @private
   */
  _getEngagementSuggestionsRuleBased(text) {
    const suggestions = [];
    
    // Check for repetitive words
    const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
    const wordCounts = {};
    words.forEach(word => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
    
    Object.entries(wordCounts)
      .filter(([word, count]) => count > 3 && word.length > 4)
      .forEach(([word, count]) => {
        suggestions.push({
          original: word,
          suggested: `Consider varying your usage of "${word}" (used ${count} times)`,
          reason: 'Repetitive word usage detected',
          confidence: 0.6
        });
      });
    
    // Check for sentence variety
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const sentenceLengths = sentences.map(s => s.trim().length);
    const avgLength = sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length || 0;
    
    if (sentenceLengths.some(len => Math.abs(len - avgLength) > 20)) {
      suggestions.push({
        original: 'Sentence length variation',
        suggested: 'Vary your sentence lengths for better rhythm',
        reason: 'Some sentences are significantly longer/shorter than average',
        confidence: 0.5
      });
    }
    
    // Check for weak words
    const weakWords = ['very', 'really', 'quite', 'rather', 'somewhat', 'pretty'];
    weakWords.forEach(weakWord => {
      const regex = new RegExp(`\\b${weakWord}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches && matches.length > 2) {
        suggestions.push({
          original: weakWord,
          suggested: `Consider stronger alternatives to "${weakWord}"`,
          reason: 'Weak modifier overuse detected',
          confidence: 0.6
        });
      }
    });
    
    return {
      suggestions: suggestions.slice(0, 5),
      message: suggestions.length > 0 
        ? `Found ${suggestions.length} engagement improvement(s)` 
        : 'Text engagement looks good'
    };
  }

  /**
   * Rule-based delivery suggestions
   * @private
   */
  _getDeliverySuggestionsRuleBased(text) {
    const suggestions = [];
    
    // Check for appropriate formality based on context
    const lowerText = text.toLowerCase();
    
    // Very formal suggestions for casual contexts
    if (lowerText.includes('hey') || lowerText.includes('hi') || lowerText.includes('yo')) {
      if (lowerText.includes('please') || lowerText.includes('thank you') || 
          lowerText.includes('regards') || lowerText.includes('sincerely')) {
        suggestions.push({
          original: 'Mixed formality',
          suggested: 'Consider keeping consistent formality throughout',
          reason: 'Casual greeting with formal closing detected',
          confidence: 0.6
        });
      }
    }
    
    return {
      suggestions: suggestions,
      message: suggestions.length > 0 
        ? `Found ${suggestions.length} delivery improvement(s)` 
        : 'Text delivery looks good'
    };
  }

  /**
   * Get a simpler synonym for a word (basic implementation)
   * @private
   */
  _getSimplerSynonym(word) {
    // Basic mapping of complex words to simpler ones
    const synonymMap = {
      'utilize': 'use',
      'facilitate': 'help',
      'demonstrate': 'show',
      'terminate': 'end',
      'initiate': 'start',
      'approximately': 'about',
      'numerous': 'many',
      'sufficient': 'enough',
      'require': 'need',
      'purchase': 'buy'
    };
    
    return synonymMap[word.toLowerCase()] || word;
  }
}

module.exports = new GrammarService();