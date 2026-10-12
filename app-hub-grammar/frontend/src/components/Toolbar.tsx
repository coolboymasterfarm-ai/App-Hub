import React from 'react';

const Toolbar: React.FC = () => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="px-4 py-3 border-b dark:border-gray-700">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center">
          <span className="mr-2">🔧</span>
          Writing Tools
        </h3>
      </div>
      
      <div className="px-4 py-3 space-y-3">
        {/* Formatting buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {}}
            className="flex-1 min-w-[80px] rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 dark:bg-gray-600 dark:hover:bg-gray-500"
          >
            Bold
          </button>
          <button
            onClick={() => {}}
            className="flex-1 min-w-[80px] rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 dark:bg-gray-600 dark:hover:bg-gray-500"
          >
            Italic
          </button>
          <button
            onClick={() => {}}
            className="flex-1 min-w-[80px] rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 dark:bg-gray-600 dark:hover:bg-gray-500"
          >
            Underline
          </button>
          <button
            onClick={() => {}}
            className="flex-1 min-w-[80px] rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 dark:bg-gray-600 dark:hover:bg-gray-500"
          >
            Strikethrough
          </button>
        </div>
        
        {/* Alignment buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {}}
            className="flex-1 min-w-[80px] rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 dark:bg-gray-600 dark:hover:bg-gray-500"
          >
            Align Left
          </button>
          <button
            onClick={() => {}}
            className="flex-1 min-w-[80px] rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 dark:bg-gray-600 dark:hover:bg-gray-500"
          >
            Center
          </button>
          <button
            onClick={() => {}}
            className="flex-1 min-w-[80px] rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 dark:bg-gray-600 dark:hover:bg-gray-500"
          >
            Align Right
          </button>
          <button
            onClick={() => {}}
            className="flex-1 min-w-[80px] rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 dark:bg-gray-600 dark:hover:bg-gray-500"
          >
            Justify
          </button>
        </div>
        
        {/* Language selector */}
        <div>
          <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
            Language
          </label>
          <select
            className="w-full rounded-md bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="it">Italian</>
            <option value="pt">Portuguese</option>
            <option value="nl">Dutch</option>
            <option value="ru">Russian</option>
            <option value="ja">Japanese</option>
            <option value="zh">Chinese</option>
          </select>
        </div>
        
        {/* Writing goals */}
        <div>
          <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
            Writing Goals
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {}}
              className="flex-1 min-w-[80px] rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 dark:bg-gray-600 dark:hover:bg-gray-500"
            >
              Word Count
            </button>
            <button
              onClick={() => {}}
              className="flex-1 min-w-[80px] rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 dark:bg-gray-600 dark:hover:bg-gray-500"
            >
              Character Limit
            </button>
            <button
              onClick={() => {}}
              className="flex-1 min-w-[80px] rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 dark:bg-gray-600 dark:hover:bg-gray-500"
            >
              Reading Level
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Toolbar;