const axios = require('axios');

const TYPES = { grammar: 'Grammar', spelling: 'Spelling', punctuation: 'Punctuation', style: 'Style' };

// Where each mistake the model named sits in the text, in order (the model gives words, not positions).
// Returns the matches the page shows: { message, replacements: [string], offset, length, category: { id, name } }.
function locate(text, issues) {
  const out = [];
  let from = 0;
  for (const i of Array.isArray(issues) ? issues : []) {
    const wrong = String((i && i.wrong) || '');
    const fix = String((i && i.fix) ?? '');
    if (!wrong || wrong === fix) continue;
    let at = text.indexOf(wrong, from);
    if (at < 0) at = text.indexOf(wrong); // the model listed it out of order
    if (at < 0 || out.some((m) => at < m.offset + m.length && m.offset < at + wrong.length)) continue; // not there, or overlaps
    const id = TYPES[i.type] ? i.type : 'grammar';
    out.push({ message: String(i.why || 'Possible mistake'), replacements: [fix], offset: at, length: wrong.length, category: { id, name: TYPES[id] } });
    from = at + wrong.length;
  }
  return out.sort((a, b) => a.offset - b.offset);
}

// LanguageTool's matches in the same shape (its replacements are objects, its category sits under rule).
const fromLanguageTool = (data) => (data.matches || []).map((m) => ({
  message: m.message, offset: m.offset, length: m.length,
  replacements: (m.replacements || []).slice(0, 5).map((r) => r.value),
  category: { id: String((m.rule && m.rule.category && m.rule.category.id) || 'grammar').toLowerCase(),
    name: (m.rule && m.rule.category && m.rule.category.name) || 'Grammar' },
}));

class GrammarService {
  constructor() {
    // The AI models on this PC: App Hub runs Ollama and downloads its models (AI Models page).
    this.ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
    this.model = process.env.OLLAMA_MODEL || null; // else the best one installed
    // Used only when no local model answers: LanguageTool's free public server (about 20 checks a minute)
    this.languagetoolUrl = process.env.LANGUAGETOOL_URL || 'https://api.languagetool.org/v2';
  }

  // The local model to use: OLLAMA_MODEL, else an installed qwen3 (what App Hub recommends), else any chat model.
  async _localModel() {
    if (this.model) return this.model;
    const { data } = await axios.get(`${this.ollamaUrl}/api/tags`, { timeout: 2000 });
    const names = (data.models || []).map((m) => m.name).filter((n) => !/embed/i.test(n));
    return names.find((n) => /^qwen3/.test(n)) || names[0] || null;
  }

  // Ask the local model; its answer is JSON. null when no model is running or the answer isn't usable.
  async _ask(task, text) {
    try {
      const model = await this._localModel();
      if (!model) return null;
      const { data } = await axios.post(`${this.ollamaUrl}/api/chat`, {
        model, stream: false, format: 'json', think: false, keep_alive: '10m', options: { temperature: 0 },
        messages: [{ role: 'system', content: task + ' Answer with JSON only.' }, { role: 'user', content: text }],
      }, { timeout: 120000 });
      return { model, answer: JSON.parse(data.message.content) };
    } catch (error) {
      console.warn('Local model not available:', error.message);
      return null;
    }
  }

  /**
   * Check text for grammar, spelling, punctuation and style: the local model first, LanguageTool if none runs.
   * @returns {Promise<Object>} { matches, engine }
   */
  async checkGrammar(text, language = 'en-US') {
    const local = await this._ask(
      `You proofread ${language} text. List every grammar, spelling and punctuation mistake, and clear style problems. ` +
      'Return {"issues":[{"wrong":"the exact words from the text","fix":"the corrected words","why":"a short reason",' +
      '"type":"grammar|spelling|punctuation|style"}]}. Copy "wrong" exactly as written. Return {"issues":[]} if there are none.', text);
    if (local) return { matches: locate(text, local.answer.issues), engine: `local model ${local.model}` };
    try {
      const response = await axios.post(`${this.languagetoolUrl}/check`,
        new URLSearchParams({ text, language, enabledOnly: false }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      return { matches: fromLanguageTool(response.data), engine: 'LanguageTool' };
    } catch (error) {
      throw new Error(`Grammar check failed: no local model is running (open App Hub > AI Models) and LanguageTool: ${error.message}`);
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
   * Detect tone of text with the local model, or the built-in rules
   * @returns {Promise<Object>} Tone analysis result
   */
  async detectTone(text) {
    const local = await this._ask('Judge the tone of the text. Return {"tone":"formal|informal|casual|friendly|confident|' +
      'neutral|negative|positive","confidence":0-1,"details":"one short sentence why"}.', text);
    if (local && local.answer.tone) return { ...local.answer, engine: `local model ${local.model}` };
    return this._detectToneRuleBased(text);
  }

  /**
   * Get clarity suggestions with the local model, or the built-in rules
   * @returns {Promise<Object>} Clarity suggestions
   */
  async getClaritySuggestions(text) {
    const local = await this._ask('Find sentences that are unclear, wordy or hard to follow. Return {"suggestions":' +
      '[{"original":"the exact sentence","suggested":"a clearer version","reason":"short reason"}]}, or {"suggestions":[]}.', text);
    if (local && Array.isArray(local.answer.suggestions)) {
      return { suggestions: local.answer.suggestions, message: `Clarity suggestions from ${local.model} on this PC` };
    }
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
   * Get vocabulary suggestions (stronger or simpler words) with the local model
   * @returns {Promise<Object>} Vocabulary suggestions
   */
  async getVocabularySuggestions(text) {
    const local = await this._ask('Suggest better word choices: weak, vague, repeated or overly complex words. Return ' +
      '{"suggestions":[{"original":"the exact word","suggested":"a better word","reason":"short reason"}]} (at most 8).', text);
    if (local && Array.isArray(local.answer.suggestions)) {
      return { suggestions: local.answer.suggestions, message: `Vocabulary suggestions from ${local.model} on this PC` };
    }
    return { suggestions: [], message: 'Vocabulary suggestions need a local AI model: open App Hub > AI Models.' };
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


}

module.exports = new GrammarService();
module.exports.locate = locate;