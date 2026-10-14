/**
 * Writing Assistant Main Logic - Grammarly Inspired
 * Handles UI interactions, API integration, and user experience
 */

// freellmService is available globally from freellm.js

class WritingAssistant {
    constructor() {
        // DOM elements - new structure
        this.textarea = document.getElementById('writing-input');
        
        // Sidebar navigation
        this.sidebarItems = document.querySelectorAll('.sidebar .nav-item');
        
        // Toolbar buttons
        this.formatButtons = document.querySelectorAll('.toolbar .format-btn');
        this.askAiButton = document.querySelector('.toolbar .ask-ai-btn');
        
        // Suggestions panel
        this.tabButtons = document.querySelectorAll('.suggestions-panel .panel-tabs .tab-btn');
        this.filterButtons = document.querySelectorAll('.suggestions-panel .filters .filter-btn');
        this.suggestionsContainer = document.querySelector('.suggestions-panel .suggestions');
        this.scoreCircle = document.querySelector('.suggestions-panel .score-circle');
        this.progressLabel = document.querySelector('.suggestions-panel .progress-label');
        this.aiDetectorText = document.querySelector('.suggestions-panel .ai-detector p');
        
        // Settings elements
        this.settingsToggle = document.querySelector('.settings-toggle');
        this.settingsPanel = document.getElementById('settings-panel');
        this.endpointInput = document.getElementById('endpoint-input');
        this.apikeyInput = document.getElementById('apikey-input');
        this.saveSettingsBtn = document.getElementById('save-settings');
        this.clearSettingsBtn = document.getElementById('clear-settings');
        this.closeSettingsBtn = document.querySelector('.close-settings');

        // State
        this.originalText = '';
        this.suggestions = null;
        this.appliedSuggestions = new Set();
        this.isChecking = false;
        this.currentTab = 'proofread';
        this.currentFilter = 'all';

        // Initialize
        this.init();
        this.loadSettings();
    }

    init() {
        // Event listeners for textarea
        this.textarea.addEventListener('input', () => {
            if (this.isChecking) return;
            // Reset checking state when user types
            if (this.suggestions) {
                this.hideResults();
            }
        });

        // Sidebar navigation
        this.sidebarItems.forEach(item => {
            item.addEventListener('click', () => {
                this.sidebarItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            });
        });

        // Toolbar buttons
        this.formatButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Toggle active state for formatting buttons (except Ask AI)
                if (btn !== this.askAiButton) {
                    btn.classList.toggle('active');
                }
            });
        });
        
        this.askAiButton.addEventListener('click', () => {
            this.checkWriting();
        });

        // Suggestions panel tabs
        this.tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.tabButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTab = btn.textContent.toLowerCase().includes('proofread') ? 'proofread' : 'improve';
                this.renderSuggestions();
            });
        });

        // Filter buttons
        this.filterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.filterButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentFilter = btn.textContent.toLowerCase();
                this.renderSuggestions();
            });
        });

        // Settings event listeners
        if (this.settingsToggle) {
            this.settingsToggle.addEventListener('click', () => this.toggleSettingsPanel());
        }
        if (this.closeSettingsBtn) {
            this.closeSettingsBtn.addEventListener('click', () => this.toggleSettingsPanel());
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
                if (this.settingsPanel && !this.settingsPanel.classList.contains('hidden')) {
                    this.toggleSettingsPanel();
                } else {
                    this.textarea.value = '';
                    this.hideResults();
                }
            }
        });
    }

    showLoading() {
        this.suggestionsContainer.innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
                <p>Analyzing your writing...</p>
            </div>
        `;
        this.isChecking = true;
    }

    hideLoading() {
        this.isChecking = false;
    }

    showError(message) {
        this.suggestionsContainer.innerHTML = `
            <div class="error-state">
                <p>${message || 'Unable to check writing. Please try again.'}</p>
            </div>
        `;
        this.isChecking = false;
    }

    showResults(suggestionsData) {
        this.suggestions = suggestionsData;
        this.appliedSuggestions.clear();
        
        // Update score (mock data for now - would come from API)
        this.updateScore(85);
        
        // Update progress (mock data)
        this.updateProgress(70);
        
        // Update AI detector (mock data)
        this.updateAIDetector('This text is 98% human-written.');
        
        this.renderSuggestions();
    }

    hideResults() {
        this.suggestionsContainer.innerHTML = `
            <div class="empty-state">
                <p>Start writing to see suggestions</p>
            </div>
        `;
        this.suggestions = null;
        this.appliedSuggestions.clear();
        this.updateScore(0);
        this.updateProgress(0);
        this.updateAIDetector('');
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
        
        // Update freellmService with saved settings
        if (window.freellmService) {
            if (savedEndpoint) {
                window.freellmService.setEndpoint(savedEndpoint);
            }
            if (savedApiKey) {
                window.freellmService.setApiKey(savedApiKey);
            }
        }
    }
    
    saveSettings() {
        const endpoint = this.endpointInput ? this.endpointInput.value.trim() : '';
        const apiKey = this.apikeyInput ? this.apikeyInput.value.trim() : '';
        
        if (window.freellmService) {
            window.freellmService.setEndpoint(endpoint);
            window.freellmService.setApiKey(apiKey);
        }
        
        this.showToast('Settings saved!');
    }
    
    clearSettings() {
        if (this.endpointInput) this.endpointInput.value = '';
        if (this.apikeyInput) this.apikeyInput.value = '';
        
        if (window.freellmService) {
            window.freellmService.setEndpoint('');
            window.freellmService.setApiKey('');
        }
        
        this.showToast('Settings cleared!');
    }

    updateScore(score) {
        if (this.scoreCircle) {
            this.scoreCircle.textContent = score;
            this.scoreCircle.style.background = `conic-gradient(
                var(--primary-teal) ${score}%,
                #E6E6E6 ${score}%
            )`;
        }
    }

    updateProgress(percent) {
        if (this.progressLabel) {
            this.progressLabel.textContent = `${percent}% Proofread`;
        }
    }

    updateAIDetector(text) {
        if (this.aiDetectorText) {
            this.aiDetectorText.textContent = text;
        }
    }

    renderSuggestions() {
        if (!this.suggestions) {
            this.suggestionsContainer.innerHTML = `
                <div class="empty-state">
                    <p>Start writing to see suggestions</p>
                </div>
            `;
            return;
        }

        // Filter suggestions based on current tab and filter
        let filteredSuggestions = [];
        
        if (this.currentTab === 'proofread') {
            Object.keys(this.suggestions).forEach(category => {
                if (this.suggestions[category]) {
                    this.suggestions[category].forEach(suggestion => {
                        filteredSuggestions.push({
                            ...suggestion,
                            category: category
                        });
                    });
                }
            });
        } else {
            filteredSuggestions = [{
                id: 'improve-1',
                message: 'Consider varying your sentence structure to improve flow',
                category: 'style',
                originalText: 'The dogs barks at the mailman.',
                suggestedText: 'The dogs bark at the mailman.'
            }];
        }

        // Apply filter
        if (this.currentFilter !== 'all') {
            filteredSuggestions = filteredSuggestions.filter(s => 
                s.category === this.currentFilter
            );
        }

        if (filteredSuggestions.length === 0) {
            this.suggestionsContainer.innerHTML = `
                <div class="empty-state">
                    <p>No ${this.currentFilter === 'all' ? '' : this.currentFilter + ' '}suggestions found</p>
                </div>
            `;
            return;
        }

        // Render suggestions
        this.suggestionsContainer.innerHTML = '';
        
        filteredSuggestions.forEach((suggestion) => {
            const suggestionElement = this.createSuggestionElement(suggestion);
            this.suggestionsContainer.appendChild(suggestionElement);
        });
    }

    createSuggestionElement(suggestion) {
        const item = document.createElement('div');
        item.className = `suggestion-card ${this.appliedSuggestions.has(suggestion.id) ? 'applied' : ''}`;
        
        item.innerHTML = `
            <div class="error-icon">❌</div>
            <div class="suggestion-content">
                <h4>${this.getErrorTitle(suggestion)}</h4>
                <p class="problem-text">${this.escapeHtml(suggestion.originalText || suggestion.problemText || '')}</p>
                <p class="fix-text">${this.escapeHtml(suggestion.suggestedText || suggestion.fixText || '')}</p>
            </div>
        `;
        
        item.dataset.suggestionId = suggestion.id;
        
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('fix-text')) return;
            
            if (this.appliedSuggestions.has(suggestion.id)) {
                this.unapplySuggestion(suggestion.id);
            } else {
                this.applySuggestion(suggestion.id);
            }
        });
        
        return item;
    }

    getErrorTitle(suggestion) {
        const titleMap = {
            'subject-verb-agreement': 'Correct subject-verb agreement',
            'comma-after-introductory-phrase': 'Use a comma after an introductory phrase',
            'misspelling': 'Correct spelling',
            'punctuation-error': 'Fix punctuation',
            'style-issue': 'Improve style',
            'clarity-issue': 'Improve clarity',
            'delivery-issue': 'Improve delivery'
        };
        
        return titleMap[suggestion.type] || suggestion.message || 'Writing suggestion';
    }

    applySuggestion(suggestionId) {
        this.appliedSuggestions.add(suggestionId);
        
        const suggestionItems = this.suggestionsContainer.querySelectorAll('.suggestion-card');
        suggestionItems.forEach(item => {
            const id = item.dataset.suggestionId;
            if (id === suggestionId) {
                item.classList.add('applied');
            }
        });
    }

    unapplySuggestion(suggestionId) {
        this.appliedSuggestions.delete(suggestionId);
        
        const suggestionItems = this.suggestionsContainer.querySelectorAll('.suggestion-card');
        suggestionItems.forEach(item => {
            const id = item.dataset.suggestionId;
            if (id === suggestionId) {
                item.classList.remove('applied');
            }
        });
    }

    async checkWriting() {
        const text = this.textarea.value.trim();
        
        if (!text) {
            this.showError('Please enter some text to check');
            return;
        }
        
        this.isChecking = true;
        this.showLoading();
        
        try {
            if (window.freellmService) {
                const response = await window.freellmService.checkWriting(text);
                this.showResults(response.suggestions);
            } else {
                throw new Error('FreeLLM service not initialized');
            }
        } catch (error) {
            console.error('Writing check failed:', error);
            this.showError(error.message || 'Failed to check writing. Please try again.');
        } finally {
            this.isChecking = false;
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
