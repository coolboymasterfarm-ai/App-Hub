/**
 * Writing Assistant Main Logic
 * Handles UI interactions, API integration, and user experience
 */

import freellmService from './freellm.js';

class WritingAssistant {
    constructor() {
        // DOM elements
        this.textarea = document.getElementById('writing-input');
        this.charCount = document.getElementById('char-count');
        this.wordCount = document.getElementById('word-count');
        this.checkBtn = document.getElementById('check-btn');
        this.resultsSection = document.getElementById('results-section');
        this.loadingState = document.getElementById('loading-state');
        this.errorState = document.getElementById('error-state');
        this.suggestionsContent = document.getElementById('suggestions-content');
        this.applyAllBtn = document.getElementById('apply-all-btn');
        this.copyBtn = document.getElementById('copy-btn');
        this.downloadBtn = document.getElementById('download-btn');
        this.previewText = document.getElementById('preview-text');

        // Settings elements
        this.settingsToggle = document.getElementById('settings-toggle');
        this.settingsPanel = document.getElementById('settings-panel');
        this.endpointInput = document.getElementById('endpoint-input');
        this.apiKeyInput = document.getElementById('apikey-input');
        this.saveSettingsBtn = document.getElementById('save-settings');
        this.clearSettingsBtn = document.getElementById('clear-settings');

        // State
        this.originalText = '';
        this.suggestions = null;
        this.appliedSuggestions = new Set(); // Track which suggestions have been applied
        this.isChecking = false;

        // Initialize
        this.init();
    }

    init() {
        // Load saved settings
        this.loadSettings();

        // Event listeners
        this.textarea.addEventListener('input', () => {
            this.updateCounts();
            // Clear results when user starts typing new text
            if (this.isChecking) return;
            this.hideResults();
        });

        this.checkBtn.addEventListener('click', () => this.checkWriting());

        // Settings toggle
        this.settingsToggle.addEventListener('click', () => this.toggleSettingsPanel());

        this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());

        this.clearSettingsBtn.addEventListener('click', () => this.clearSettings());

        this.applyAllBtn.addEventListener('click', () => this.applyAllSuggestions());

        this.copyBtn.addEventListener('click', () => this.copyCorrectedText());

        this.downloadBtn.addEventListener('click', () => this.downloadCorrectedText());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                this.checkWriting();
            }
            if (e.key === 'Escape' && this.settingsPanel && !this.settingsPanel.classList.contains('hidden')) {
                this.toggleSettingsPanel();
            }
            if (e.key === 'Escape') {
                this.textarea.value = '';
                this.updateCounts();
                this.hideResults();
            }
        });
    }

    loadSettings() {
        // Load endpoint
        const savedEndpoint = localStorage.getItem('freellmEndpoint');
        if (savedEndpoint) {
            this.endpointInput.value = savedEndpoint;
            freellmService.setEndpoint(savedEndpoint);
        }

        // Load API key
        const savedApiKey = localStorage.getItem('freellmApiKey');
        if (savedApiKey) {
            this.apiKeyInput.value = savedApiKey;
            freellmService.setApiKey(savedApiKey);
        }
    }

    saveSettings() {
        const endpoint = this.endpointInput.value.trim();
        const apiKey = this.apiKeyInput.value.trim();

        if (endpoint) {
            freellmService.setEndpoint(endpoint);
            showToast('Settings saved!');
        } else {
            showToast('Please enter an endpoint URL', 3000);
            return;
        }

        if (apiKey) {
            freellmService.setApiKey(apiKey);
        } else {
            freellmService.setApiKey(null);
        }
    }

    clearSettings() {
        if (confirm('Clear all saved settings?')) {
            localStorage.removeItem('freellmEndpoint');
            localStorage.removeItem('freellmApiKey');
            this.endpointInput.value = '';
            this.apiKeyInput.value = '';
            freellmService.endpoint = freellmService.getEndpoint();
            freellmService.setApiKey(null);
            showToast('Settings cleared');
        }
    }

    toggleSettingsPanel() {
        this.settingsPanel.classList.toggle('hidden');
        if (!this.settingsPanel.classList.contains('hidden')) {
            this.endpointInput.focus();
        }
    }

    updateCounts() {
        const text = this.textarea.value;
        const charCount = text.length;
        const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
        
        this.charCount.textContent = charCount;
        this.wordCount.textContent = wordCount;
    }

    showLoading() {
        this.loadingState.classList.remove('hidden');
        this.errorState.classList.add('hidden');
        this.suggestionsContent.classList.add('hidden');
        this.checkBtn.disabled = true;
        this.checkBtn.textContent = 'Checking...';
    }

    hideLoading() {
        this.loadingState.classList.add('hidden');
        this.checkBtn.disabled = false;
        this.checkBtn.textContent = 'Check Writing';
    }

    showError(message) {
        this.errorState.textContent = message || 'Unable to check writing. Please try again.';
        this.errorState.classList.remove('hidden');
        this.loadingState.classList.add('hidden');
        this.suggestionsContent.classList.add('hidden');
        this.checkBtn.disabled = false;
        this.checkBtn.textContent = 'Check Writing';
    }

    hideError() {
        this.errorState.classList.add('hidden');
    }

    showResults(suggestionsData) {
        this.hideLoading();
        this.hideError();
        
        this.suggestions = suggestionsData;
        this.appliedSuggestions.clear();
        
        // Render suggestions
        this.renderSuggestions(suggestionsData);
        
        // Show preview
        this.updatePreview();
        
        // Show results section
        this.resultsSection.classList.remove('hidden');
    }

    hideResults() {
        this.resultsSection.classList.add('hidden');
        this.suggestionsContent.innerHTML = '';
        this.previewText.textContent = '';
        this.suggestions = null;
        this.appliedSuggestions.clear();
    }

    renderSuggestions(suggestionsData) {
        this.suggestionsContent.innerHTML = '';

        if (!suggestionsData || Object.keys(suggestionsData).length === 0) {
            this.suggestionsContent.innerHTML = '<p>No suggestions found! Your writing looks great.</p>';
            return;
        }

        // Define category order and labels
        const categories = [
            { id: 'grammar', label: 'Grammar', icon: '📝' },
            { id: 'spelling', label: 'Spelling', icon: '🔤' },
            { id: 'punctuation', label: 'Punctuation', icon: '📌' },
            { id: 'style', label: 'Style', icon: '✨' },
            { id: 'tone', label: 'Tone', icon: '🎯' },
            { id: 'vocabulary', label: 'Vocabulary', icon: '📚' },
            { id: 'clarity', label: 'Clarity', icon: '👁️' }
        ];

        categories.forEach(category => {
            const suggestions = suggestionsData[category.id];
            if (suggestions && suggestions.length > 0) {
                const categorySection = document.createElement('div');
                categorySection.className = 'suggestion-category';
                
                const categoryTitle = document.createElement('h4');
                categoryTitle.innerHTML = `${category.icon} ${category.label} (${suggestions.length})`;
                categorySection.appendChild(categoryTitle);
                
                suggestions.forEach((suggestion, index) => {
                    const suggestionElement = this.createSuggestionElement(suggestion, index, category.id);
                    categorySection.appendChild(suggestionElement);
                });
                
                this.suggestionsContent.appendChild(categorySection);
            }
        });
    }

    createSuggestionElement(suggestion, index, category) {
        const item = document.createElement('div');
        item.className = `suggestion-item ${this.appliedSuggestions.has(`${category}-${index}`) ? 'applied' : ''}`;
        
        // Create unique ID for this suggestion
        const suggestionId = `${category}-${index}`;
        
        // Suggestion text
        const textElement = document.createElement('p');
        textElement.className = 'suggestion-text';
        textElement.textContent = suggestion.message || suggestion.text || 'No description available';
        item.appendChild(textElement);
        
        // Actions
        const actions = document.createElement('div');
        actions.className = 'suggestion-actions';
        
        // Checkbox to apply suggestion
        const checkboxLabel = document.createElement('label');
        checkboxLabel.className = 'suggestion-checkbox';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = this.appliedSuggestions.has(suggestionId);
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                this.applySuggestion(suggestionId, suggestion);
            } else {
                this.unapplySuggestion(suggestionId);
            }
            this.updatePreview();
        });
        
        checkboxLabel.appendChild(checkbox);
        checkboxLabel.appendChild(document.createTextNode(' Apply suggestion'));
        actions.appendChild(checkboxLabel);
        
        // Apply button (alternative to checkbox)
        const applyBtn = document.createElement('button');
        applyBtn.className = 'apply-btn';
        applyBtn.textContent = 'Apply';
        applyBtn.addEventListener('click', () => {
            checkbox.checked = true;
            this.applySuggestion(suggestionId, suggestion);
            this.updatePreview();
        });
        actions.appendChild(applyBtn);
        
        item.appendChild(actions);
        return item;
    }

    applySuggestion(suggestionId, suggestion) {
        this.appliedSuggestions.add(suggestionId);
        
        // Update UI
        const suggestionItems = this.suggestionsContent.querySelectorAll('.suggestion-item');
        suggestionItems.forEach(item => {
            // This is a simplified approach - in a real app you'd have better ID tracking
            if (item.querySelector('input[type="checkbox"]').checked) {
                item.classList.add('applied');
            } else {
                item.classList.remove('applied');
            }
        });
    }

    unapplySuggestion(suggestionId) {
        this.appliedSuggestions.delete(suggestionId);
        
        // Update UI
        const suggestionItems = this.suggestionsContent.querySelectorAll('.suggestion-item');
        suggestionItems.forEach(item => {
            // This is a simplified approach - in a real app you'd have better ID tracking
            if (!item.querySelector('input[type="checkbox"]').checked) {
                item.classList.remove('applied');
            }
        });
    }

    applyAllSuggestions() {
        if (!this.suggestions) return;
        
        // Check all checkboxes
        const checkboxes = this.suggestionsContent.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            if (!checkbox.checked) {
                checkbox.checked = true;
                // Get suggestion data - simplified for demo
                // In a real implementation, you'd have better data association
            }
        });
        
        // Mark all suggestions as applied
        // This is simplified - real implementation would properly track each suggestion
        Object.keys(this.suggestions).forEach(category => {
            this.suggestions[category].forEach((_, index) => {
                this.appliedSuggestions.add(`${category}-${index}`);
            });
        });
        
        // Update UI
        const suggestionItems = this.suggestionsContent.querySelectorAll('.suggestion-item');
        suggestionItems.forEach(item => {
            item.classList.add('applied');
        });
        
        this.updatePreview();
    }

    updatePreview() {
        if (!this.suggestions) {
            this.previewText.textContent = this.originalText || '';
            return;
        }
        
        // Start with original text
        let preview = this.originalText || this.textarea.value;
        
        // Apply all selected suggestions (simplified)
        // In a real implementation, you'd apply the actual text transformations
        // suggested by the API for each selected suggestion
        
        // For demo purposes, we'll just show the original text with an indicator
        const appliedCount = this.appliedSuggestions.size;
        if (appliedCount > 0) {
            this.previewText.textContent = `${preview}\n\n[Preview showing text with ${appliedCount} suggestions applied]`;
        } else {
            this.previewText.textContent = preview;
        }
    }

    copyCorrectedText() {
        const textToCopy = this.previewText.textContent;
        if (!textToCopy || textToCopy.trim() === '') {
            showToast('No text to copy');
            return;
        }
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            showToast('Text copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy text:', err);
            showToast('Failed to copy text');
        });
    }

    downloadCorrectedText() {
        const textToDownload = this.previewText.textContent;
        if (!textToDownload || textToDownload.trim() === '') {
            showToast('No text to download');
            return;
        }
        
        const blob = new Blob([textToDownload], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'writing-assistant-corrected.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast('Text downloaded as writing-assistant-corrected.txt');
    }

    async checkWriting() {
        const text = this.textarea.value.trim();
        
        if (!text) {
            this.showError('Please enter some text to check');
            return;
        }
        
        this.isChecking = true;
        this.showLoading();
        this.hideError();
        
        try {
            const response = await freellmService.checkWriting(text);
            this.originalText = text;
            this.showResults(response);
        } catch (error) {
            console.error('Writing check failed:', error);
            this.showError(error.message || 'Failed to check writing. Please try again.');
        } finally {
            this.isChecking = false;
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.writingAssistant = new WritingAssistant();
});

// Simple toast notification system
function showToast(message) {
    // Remove any existing toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    
    // Add to document
    document.body.appendChild(toast);
    
    // Trigger reflow for animation
    toast.offsetHeight;
    
    // Show toast
    toast.classList.add('show');
    
    // Hide after delay
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// Add toast styles if not already present
if (!document.getElementById 'toast-styles') {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
        .toast {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: #333;
            color: white;
            padding: 12px 24px;
            border-radius: 4px;
            font-size: 14px;
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.3s ease;
        }
        
        .toast.show {
            opacity: 1;
        }
    `;
    document.head.appendChild(style);
}