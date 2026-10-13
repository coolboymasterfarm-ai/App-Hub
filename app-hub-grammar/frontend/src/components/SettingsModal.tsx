import React, { useState } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onRequestClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onRequestClose 
}) => {
  const [customWord, setCustomWord] = useState('');
  const [customWords, setCustomWords] = useState<string[]>([]);

  const handleAddWord = () => {
    if (customWord.trim()) {
      setCustomWords(prev => [...prev, customWord.trim()]);
      setCustomWord('');
    }
  };

  const handleRemoveWord = (word: string) => {
    setCustomWords(prev => prev.filter(w => w !== word));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Settings
            </h2>
            <button
              onClick={onRequestClose}
              className="rounded-md bg-gray-800 px-3 py-1 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-gray-600 dark:hover:bg-gray-500"
              aria-label="Close settings"
            >
              ×
            </button>
          </div>
          
          <div className="space-y-6">
            {/* Appearance */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                Appearance
              </h3>
              <div className="flex items-center space-x-3">
                <label className="flex items-center space-x-2 text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  Dark mode
                </label>
                <label className="flex items-center space-x-2 text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  High contrast
                </label>
              </div>
            </div>
            
            {/* Language */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                Language
              </h3>
              <div className="space-y-2">
                <div className="flex items-center space-x-3">
                  <label className="flex items-center space-x-2 text-gray-700 dark:text-gray-300">
                    <input
                      type="radio"
                      name="language"
                      value="en-US"
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                    />
                    English (US)
                  </label>
                </div>
                <div className="flex items-center space-x-3">
                  <label className="flex items-center space-x-2 text-gray-700 dark:text-gray-300">
                    <input
                      type="radio"
                      name="language"
                      value="en-GB"
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                    />
                    English (UK)
                  </label>
                </div>
                <div className="flex items-center space-x-3">
                  <label className="flex items-center space-x-2 text-gray-700 dark:text-gray-300">
                    <input
                      type="radio"
                      name="language"
                      value="es"
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                    />
                    Spanish
                  </label>
                </div>
              </div>
            </div>
            
            {/* Custom Dictionary */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                Custom Dictionary
              </h3>
              <div className="flex flex-col space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={customWord}
                    onChange={(e) => setCustomWord(e.target.value)}
                    placeholder="Add a word to dictionary"
                    className="flex-1 min-w-0 rounded-md bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <button
                    onClick={handleAddWord}
                    className="rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-gray-600 dark:hover:bg-gray-500"
                  >
                    Add
                  </button>
                </div>
                
                {customWords.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                      Custom words ({customWords.length}):
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {customWords.map((word, index) => (
                        <div key={index} className="flex items-center space-x-1">
                          <span className="text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                            {word}
                          </span>
                          <button
                            onClick={() => handleRemoveWord(word)}
                            className="rounded-md bg-red-500 px-1 py-0.5 text-xs text-white hover:bg-red-600 focus:outline-none"
                            aria-label={`Remove ${word}`}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Notifications */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                Notifications
              </h3>
              <div className="space-y-2">
                <div className="flex items-center space-x-3">
                  <label className="flex items-center space-x-2 text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    Sound alerts for errors
                  </label>
                </div>
                <div className="flex items-center space-x-3">
                  <label className="flex items-center space-x-2 text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    Desktop notifications
                  </label>
                </div>
                <div className="flex items-center space-x-3">
                  <label className="flex items-center space-x-2 text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    Weekly progress email
                  </label>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-6 pt-5 border-t border-gray-100 dark:border-gray-700">
            <button
              onClick={onRequestClose}
              className="w-full rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-gray-600 dark:hover:bg-gray-500"
            >
              Close Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;