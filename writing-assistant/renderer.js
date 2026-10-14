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
        this.progressBar = document.querySelector('.suggestions-panel .progress-bar::before');
        this.progressLabel = document.querySelector('.suggestions-panel .progress-label');
        this.aiDetectorText = document.querySelector('.suggestions-panel .ai-detector p');
        
        // Settings elements
        this.settingsToggle = document.querySelector('.settings-toggle');
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
        this.currentTab = 'proofread'; // or 'improve'
        this.currentFilter = 'all'; // or 'grammar', 'clarity', 'delivery'

        // Initialize
        this.init();
        this.loadSettings();
    }

    init() {
        // Event listeners
        this.textarea.addEventListener('input', () => {
            if (this.isChecking) return;
            // Reset checking state when user types
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
            // Ask AI functionality would go here
            this.askAiButton.classList.add('active');
            setTimeout(() => this.askAiButton.classList.remove('active'), 300);
        });

        // Suggestions panel tabs
        this.tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.tabButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTab = btn.textContent.toLowerCase().includes('proofread') ? 'proofread' : 'improve';
                this.renderSuggestions(); // Re-render with current filter
            });
        });

        // Filter buttons
        this.filterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.filterButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentFilter = btn.textContent.toLowerCase();
                if (this.currentFilter === 'all') this.currentFilter = 'all';
                this.renderSuggestions(); // Re-render with current tab
            });
        });

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
                this.hideResults();
            }
        });
    }

    showLoading() {
        // Show loading state in suggestions panel
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
        
        // Update score (mock data for now)
        this.updateScore(85); // Would come from API
        
        // Update progress (mock data)
        this.updateProgress(70); // Would come from API
        
        // Update AI detector (mock data)
        this.updateAIDetector('This text is 98% human-written.'); // Would come from API
        
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

    updateScore(score) {
        if (this.scoreCircle) {
            this.scoreCircle.textContent = score;
            // Update the conic gradient for the score circle
            this.scoreCircle.style.background = `conic-gradient(
                var(--primary-teal) ${score}%,
                #E6E6E6 ${score}%
            )`;
        }
    }

    updateProgress(percent) {
        if (this.progressBar) {
            // This is a pseudo-element, so we need to update it differently
            // For simplicity, we'll just update a data attribute that CSS can use
            document.documentElement.style.setProperty('--progress-width', `${percent}%`);
        }
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
            // Get all suggestions and filter by category
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
            // For "Improve full paragraphs" tab, we'd have different data structure
            // For now, showing placeholder
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
        
        filteredSuggestions.forEach((suggestion, index) => {
            const suggestionElement = this.createSuggestionElement(suggestion, index);
            this.suggestionsContainer.appendChild(suggestionElement);
        });
    }

    createSuggestionElement(suggestion, index) {
        const item = document.createElement('div');
        item.className = `suggestion-card ${this.appliedSuggestions.has(suggestion.id) ? 'applied' : ''}`;
        
        const isApplied = this.appliedSuggestions.has(suggestion.id);
        
        item.innerHTML = `
            <div class="error-icon">❌</div>
            <div class="suggestion-content">
                <h4>${this.getErrorTitle(suggestion)}</h4>
                <p class="problem-text">${this.escapeHtml(suggestion.originalText || suggestion.problemText || '')}</p>
                <p class="fix-text">${this.escapeHtml(suggestion.suggestedText || suggestion.fixText || '')}</p>
            </div>
        `;
        
        // Add dataset for suggestion ID
        item.dataset.suggestionId = suggestion.id;
        
        // Add click event to apply/unapply suggestion
        item.addEventListener('click', (e) => {
            // Prevent toggling if clicking on the fix text link
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
        // Map error types to user-friendly titles
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
        
        // Update UI
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
        
        // Update UI
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
            // In a real implementation, this would call the freellmService
            // For now, we'll simulate with mock data
            await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay
            
            // Mock suggestions data
            const mockSuggestions = {
                grammar: [
                    {
                        id: 'grammar-1',
                        type: 'subject-verb-agreement',
                        message: 'Correct subject-verb agreement',
                        originalText: 'The dogs barks at the mailman.',
                        suggestedText: 'The dogs bark at the mailman.'
                    },
                    {
                        id: 'grammar-2',
                        type: 'punctuation-error',
                        message: 'Add missing comma',
                        originalText: 'After the meeting we discussed the project.',
                        suggestedText: 'After the meeting, we discussed the project.'
                    }
                ],
                clarity: [
                    {
                        id: 'clarity-1',
                        type: 'clarity-issue',
                        message: 'Consider revising for clarity',
                        originalText: 'She went to the store and bought some milk.',
                        suggestedText: 'She purchased milk at the store.'
                    }
                ],
                delivery: [
                    {
                        id: 'delivery-1',
                        type: 'delivery-issue',
                        message: 'Consider a more confident tone',
                        originalText: 'I think we should probably consider this option.',
                        suggestedText: 'We should consider this option.'
                    }
                ]
            };
            
            this.showResults(mockSuggestions);
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
        // Remove existing toast
        const existingToast = document.querySelector('.toast');
        if (existingToast) {
            existingToast.remove();
        }
        
        // Create new toast
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        // Trigger reflow to enable animation
        toast.offsetHeight;
        toast.classList.add('show');
        
        // Remove after delay
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