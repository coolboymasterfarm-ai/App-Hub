/**
 * Writing Assistant Main Logic
 * Handles UI interactions, API integration, and user experience
 */

// freellmService is available globally from freellm.js

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
        this.apikeyInput = document.getElementById('apikey-input');
        this.saveSettingsBtn = document.getElementById('save-settings');
        this.clearSettingsBtn = document.getElementById('clear-settings');

        // State
        this.originalText = '';
        this.suggestions = null;
        this.appliedSuggestions = new Set();
        this.isChecking = false;

        // Initialize
        this.init();
        this.loadSettings();
    }

    init() {
        // Event listeners
        this.textarea.addEventListener('input', () => {
            this.updateCounts();
            if (this.isChecking) return;
            this.hideResults();
        });

        this.checkBtn.addEventListener('click', () => this.checkWriting());
        this.applyAllBtn.addEventListener('click', () => this.applyAllSuggestions());
        this.copyBtn.addEventListener('click', () => this.copyCorrectedText());
        this.downloadBtn.addEventListener('click', () => this.downloadCorrectedText());
        
        // Settings event listeners
        if (this.settingsToggle) {
            this.settingsToggle.addEventListener('click', () => this.toggleSettingsPanel());
        }
        if (this.saveSettingsBtn) {
            this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        }
        if (this.clearSettingsBtn) {
            this.clearSettingsBtn.addEventListener('click', () => this.clearSettings());
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                this.checkWriting();
            }
            if (e.key === 'Escape') {
                this.textarea.value = '';
                this.updateCounts();
                this.hideResults();
            }
        });
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
        
        this.renderSuggestions(suggestionsData);
        this.updatePreview();
        this.resultsSection.classList.remove('hidden');
    }

    hideResults() {
        this.resultsSection.classList.add('hidden');
        this.suggestionsContent.innerHTML = '';
        this.previewText.textContent = '';
        this.suggestions = null;
        this.appliedSuggestions.clear();
    }
    
    toggleSettingsPanel() {
        if (this.settingsPanel) {
            this.settingsPanel.classList.toggle('hidden');
        }
    }
    
    loadSettings() {
        const savedEndpoint = localStorage.getItem('freellmEndpoint');
        const savedApiKey = localStorage.getItem('freellmApiKey');
        
        if (this.endpointInput && savedEndpoint) {
            this.endpointInput.value = savedEndpoint;
        }
        if (this.apikeyInput && savedApiKey) {
            this.apikeyInput.value = savedApiKey;
        }
    }
    
    saveSettings() {
        const endpoint = this.endpointInput ? this.endpointInput.value.trim() : '';
        const apiKey = this.apikeyInput ? this.apikeyInput.value.trim() : '';
        
        if (endpoint) {
            localStorage.setItem('freellmEndpoint', endpoint);
        } else {
            localStorage.removeItem('freellmEndpoint');
        }
        
        if (apiKey) {
            localStorage.setItem('freellmApiKey', apiKey);
        } else {
            localStorage.removeItem('freellmApiKey');
        }
        
        this.showToast('Settings saved!');
    }
    
    clearSettings() {
        if (this.endpointInput) this.endpointInput.value = '';
        if (this.apikeyInput) this.apikeyInput.value = '';
        
        localStorage.removeItem('freellmEndpoint');
        localStorage.removeItem('freellmApiKey');
        
        this.showToast('Settings cleared!');
    }

    renderSuggestions(suggestionsData) {
        this.suggestionsContent.innerHTML = '';

        if (!suggestionsData || Object.keys(suggestionsData).length === 0) {
            this.suggestionsContent.innerHTML = '<p>No suggestions found! Your writing looks great.</p>';
            return;
        }

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
        
        const suggestionId = `${category}-${index}`;
        
        const textElement = document.createElement('p');
        textElement.className = 'suggestion-text';
        textElement.textContent = suggestion.message || suggestion.text || 'No description available';
        item.appendChild(textElement);
        
        const actions = document.createElement('div');
        actions.className = 'suggestion-actions';
        
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
        
        const suggestionItems = this.suggestionsContent.querySelectorAll('.suggestion-item');
        suggestionItems.forEach(item => {
            if (item.querySelector('input[type="checkbox"]').checked) {
                item.classList.add('applied');
            } else {
                item.classList.remove('applied');
            }
        });
    }

    unapplySuggestion(suggestionId) {
        this.appliedSuggestions.delete(suggestionId);
        
        const suggestionItems = this.suggestionsContent.querySelectorAll('.suggestion-item');
        suggestionItems.forEach(item => {
            if (!item.querySelector('input[type="checkbox"]').checked) {
                item.classList.remove('applied');
            }
        });
    }

    applyAllSuggestions() {
        if (!this.suggestions) return;
        
        const checkboxes = this.suggestionsContent.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            if (!checkbox.checked) {
                checkbox.checked = true;
            }
        });
        
        Object.keys(this.suggestions).forEach(category => {
            this.suggestions[category].forEach((_, index) => {
                this.appliedSuggestions.add(`${category}-${index}`);
            });
        });
        
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
        
        let preview = this.originalText || this.textarea.value;
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
            this.showToast('No text to copy');
            return;
        }
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            this.showToast('Text copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy text:', err);
            this.showToast('Failed to copy text');
        });
    }

    downloadCorrectedText() {
        const textToDownload = this.previewText.textContent;
        if (!textToDownload || textToDownload.trim() === '') {
            this.showToast('No text to download');
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
        
        this.showToast('Text downloaded as writing-assistant-corrected.txt');
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
    
    showToast(message) {
        const existingToast = document.querySelector('.toast');
        if (existingToast) {
            existingToast.remove();
        }
        
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        
        document.body.appendChild(toast);
        toast.offsetHeight;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.writingAssistant = new WritingAssistant();
});
