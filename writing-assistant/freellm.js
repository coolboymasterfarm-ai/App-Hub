/**
 * FreeLLM API Service for Writing Assistant
 * Handles communication with the Commander's FreeLLM API endpoint
 */

class FreeLLMService {
    constructor() {
        // The endpoint can be configured in three ways:
        // 1. Global variable set by App Hub: window.FREELLM_ENDPOINT
        // 2. Local storage: localStorage.getItem('freellmEndpoint')
        // 3. Default fallback (for development only)
        this.endpoint = this.getEndpoint();
        this.apiKey = this.getApiKey();
    }

    /**
     * Get the API key from available sources (App Hub global, then localStorage).
     * @returns {string|null} The API key, or null if not set.
     */
    getApiKey() {
        if (typeof window !== 'undefined' && window.FREELLM_API_KEY) {
            return window.FREELLM_API_KEY;
        }
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem('freellmApiKey');
        }
        return null;
    }

    /**
     * Set the API key (saved to localStorage).
     * @param {string} apiKey - The API key, or null/empty to clear it.
     */
    setApiKey(apiKey) {
        this.apiKey = apiKey || null;
        if (typeof localStorage !== 'undefined') {
            if (apiKey) localStorage.setItem('freellmApiKey', apiKey);
            else localStorage.removeItem('freellmApiKey');
        }
    }

    /**
     * Get the FreeLLM API endpoint from available sources
     * @returns {string} The API endpoint URL
     */
    getEndpoint() {
        // 1. Check for global variable (set by App Hub)
        if (typeof window !== 'undefined' && window.FREELLM_ENDPOINT) {
            return window.FREELLM_ENDPOINT;
        }

        // 2. Check local storage
        if (typeof localStorage !== 'undefined') {
            const savedEndpoint = localStorage.getItem('freellmEndpoint');
            if (savedEndpoint) {
                return savedEndpoint;
            }
        }

        // 3. Fallback for development - should be configured properly in production
        console.warn('FreeLLM endpoint not configured. Using placeholder. Please set window.FREELLM_ENDPOINT or localStorage.freellmEndpoint');
        return 'https://api.example.com/freellm/check'; // Placeholder - must be replaced
    }

    /**
     * Set the FreeLLM API endpoint
     * @param {string} endpoint - The API endpoint URL
     */
    setEndpoint(endpoint) {
        this.endpoint = endpoint;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('freellmEndpoint', endpoint);
        }
    }

    /**
     * Check writing using the FreeLLM API
     * @param {string} text - The text to analyze
     * @returns {Promise<Object>} Parsed API response
     * @throws {Error} If the API call fails
     */
    async checkWriting(text) {
        if (!text || text.trim() === '') {
            throw new Error('No text provided for analysis');
        }

        try {
            const headers = { 'Content-Type': 'application/json' };
            if (this.apiKey) headers['Authorization'] = 'Bearer ' + this.apiKey;

            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    text: text,
                    // Add any other parameters your API expects
                    // e.g., language: 'en', detailLevel: 'full'
                })
            });

            if (!response.ok) {
                throw new Error('API request failed with status ' + response.status);
            }

            const data = await response.json();
            return this.parseResponse(data);
        } catch (error) {
            console.error('FreeLLM API error:', error);
            throw error;
        }
    }

    /**
     * Parse and normalize the API response into a standard format
     * @param {Object} rawResponse - The raw API response
     * @returns {Object} Parsed response with standardized structure
     */
    parseResponse(rawResponse) {
        // This function should be adjusted based on your actual FreeLLM API response format
        // The structure below is a common pattern - modify to match your API's actual response

        // Handle different possible response formats
        if (rawResponse.error) {
            throw new Error(rawResponse.error || 'Unknown API error');
        }

        // Standardized response format
        return {
            // Overall score or assessment (if provided by API)
            score: rawResponse.score || null,

            // Detailed feedback by category
            suggestions: this.categorizeSuggestions(rawResponse.suggestions || rawResponse.feedback || []),

            // Corrected version of the text (if provided by API)
            correctedText: rawResponse.correctedText || null,

            // Original text for reference
            originalText: rawResponse.originalText || null,

            // Any metadata from the API
            metadata: rawResponse.metadata || {}
        };
    }

    /**
     * Categorize suggestions into standard writing feedback types
     * @param {Array} rawSuggestions - Raw suggestions from API
     * @returns {Object} Suggestions organized by category
     */
    categorizeSuggestions(rawSuggestions) {
        // Initialize categories
        const categories = {
            grammar: [],
            spelling: [],
            punctuation: [],
            style: [],
            tone: [],
            vocabulary: [],
            clarity: []
        };

        // Process each suggestion and place in appropriate category
        rawSuggestions.forEach(suggestion => {
            // Determine category based on suggestion type or keywords
            // This logic should be adapted to match your API's actual response format
            const type = (suggestion.type || suggestion.category || '').toLowerCase();
            const message = (suggestion.message || suggestion.text || '').toLowerCase();

            let categorized = false;

            // Grammar-related
            if (type.includes('grammar') ||
                message.includes('grammar') ||
                message.includes('subject') ||
                message.includes('verb') ||
                message.includes('tense') ||
                message.includes('agreement')) {
                categories.grammar.push(suggestion);
                categorized = true;
            }

            // Spelling-related
            if (type.includes('spelling') ||
                message.includes('spelling') ||
                message.includes('misspelled') ||
                message.includes('typo')) {
                categories.spelling.push(suggestion);
                categorized = true;
            }

            // Punctuation-related
            if (type.includes('punctuation') ||
                message.includes('punctuation') ||
                message.includes('comma') ||
                message.includes('period') ||
                message.includes('semicolon') ||
                message.includes('colon')) {
                categories.punctuation.push(suggestion);
                categorized = true;
            }

            // Style-related
            if (type.includes('style') ||
                message.includes('style') ||
                message.includes('passive') ||
                message.includes('wordy') ||
                message.includes('cliché') ||
                message.includes('redundant')) {
                categories.style.push(suggestion);
                categorized = true;
            }

            // Tone-related
            if (type.includes('tone') ||
                message.includes('tone') ||
                message.includes('formal') ||
                message.includes('informal') ||
                message.includes('professional') ||
                message.includes('casual')) {
                categories.tone.push(suggestion);
                categorized = true;
            }

            // Vocabulary-related
            if (type.includes('vocabulary') ||
                message.includes('vocabulary') ||
                message.includes('word choice') ||
                message.includes('synonym')) {
                categories.vocabulary.push(suggestion);
                categorized = true;
            }

            // Clarity-related
            if (type.includes('clarity') ||
                message.includes('clarity') ||
                message.includes('unclear') ||
                message.includes('confusing')) {
                categories.clarity.push(suggestion);
                categorized = true;
            }

            // Default to style if not categorized
            if (!categorized) {
                categories.style.push(suggestion);
            }
        });

        // Remove empty categories
        return Object.fromEntries(
            Object.entries(categories).filter(([_, suggestions]) => suggestions.length > 0)
        );
    }
}

// Create and export a singleton instance
const freellmService = new FreeLLMService();
export default freellmService;
export { FreeLLMService };