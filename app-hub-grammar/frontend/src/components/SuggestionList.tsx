import React from 'react';

interface Suggestion {
  message: string;
  replacements: string[];
  offset: number;
  length: number;
  category: { id: string; name: string };
}

interface SuggestionListProps {
  suggestions: Suggestion[];
  onAccept: (suggestion: Suggestion) => void;
  currentText: string;
  onTextChange: (text: string) => void;
}

const SuggestionList: React.FC<SuggestionListProps> = ({ 
  suggestions, 
  onAccept, 
  currentText,
  onTextChange 
}) => {
  const handleAccept = (suggestion: Suggestion) => {
    onAccept(suggestion);
  };

  const getCategoryColor = (categoryId: string) => {
    const colors: Record<string, string> = {
      misspelling: '#ef4444', // red
      grammar: '#f97316', // orange
      casings: '#eab308', // yellow
      punctuation: '#84cc16', // lime
      typography: '#06b6d4', // cyan
      redundancy: '#8b5cf6', // violet
      style: '#ec4899', // pink
      default: '#6366f1' // indigo
    };
    return colors[categoryId] || colors.default;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div className="px-4 py-3 border-b dark:border-gray-700">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center">
          <span className="mr-2">💡</span>
          Suggestions ({suggestions.length})
        </h3>
      </div>
      
      <div className="max-h-[300px] overflow-y-auto">
        {suggestions.map((suggestion, index) => (
          <div key={index} className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <p className="text-sm text-gray-800 dark:text-gray-200 mb-1">
                  {suggestion.message}
                </p>
                
                {/* Show the problematic text snippet */}
                {suggestion.offset !== undefined && suggestion.length !== undefined && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    <span className="font-mono bg-gray-50 dark:bg-gray-700 px-1 py-0.5 rounded">
                      "{currentText.slice(suggestion.offset, suggestion.offset + suggestion.length)}"
                    </span>
                  </div>
                )}
                
                {/* Show replacement options */}
                {suggestion.replacements.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {suggestion.replacements.map((replacement, idx) => (
                      <button
                        key={idx}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAccept(suggestion);
                        }}
                        className="px-2 py-1 text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100 rounded hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors"
                      >
                        {replacement}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Category badge */}
              <span className={`ml-3 px-2 py-0.5 text-xs rounded-full bg-${getCategoryColor(suggestion.category.id)}/20 text-${getCategoryColor(suggestion.category.id)}`}>
                {suggestion.category.name}
              </span>
            </div>
          </div>
        ))}
        
        {suggestions.length === 0 && (
          <div className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
            No active suggestions
          </div>
        )}
      </div>
    </div>
  );
};

export default SuggestionList;