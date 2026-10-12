import React, { useState } from 'react';
import TextEditor from './components/TextEditor';
import Toolbar from './components/Toolbar';
import StatisticsPanel from './components/StatisticsPanel';
import SettingsModal from './components/SettingsModal';
import { useDarkMode } from './hooks/useDarkMode';
import { LanguageContext } from './context/LanguageContext';

function App() {
  const [text, setText] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { darkMode, toggleDarkMode } = useDarkMode();

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200 ${darkMode ? 'dark' : ''}`}>
      <LanguageContext.Provider value={{ language: 'en-US', setLanguage: () => {} }}>
        <header className="bg-white dark:bg-gray-800 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  App Hub Grammar
                </h1>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-gray-600 dark:hover:bg-gray-500"
                  aria-label="Open settings"
                >
                  Settings
                </button>
                <button
                  onClick={toggleDarkMode}
                  className="rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-gray-600 dark:hover:bg-gray-500"
                  aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {darkMode ? '☀️' : '🌙'}
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="w-full md:w-2/3">
              <TextEditor 
                text={text} 
                onTextChange={setText} 
              />
            </div>
            <div className="w-full md:w-1/3 space-y-4">
              <StatisticsPanel text={text} />
            </div>
          </div>
        </main>

        <SettingsModal
          isOpen={isSettingsOpen}
          onRequestClose={() => setIsSettingsOpen(false)}
        />
      </LanguageContext.Provider>
    </div>
  );
}

export default App;