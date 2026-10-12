import React, { useState, useEffect } from 'react';

interface StatisticsPanelProps {
  text: string;
}

const StatisticsPanel: React.FC<StatisticsPanelProps> = ({ text }) => {
  const [stats, setStats] = useState({
    words: 0,
    characters: 0,
    sentences: 0,
    readingTime: 0,
    speakingTime: 0
  });

  // Calculate text statistics
  const calculateStats = (text: string) => {
    if (!text.trim()) {
      return {
        words: 0,
        characters: 0,
        sentences: 0,
        readingTime: 0,
        speakingTime: 0
      };
    }

    const words = text.trim().split(/\s+/).length;
    const characters = text.length;
    const sentences = text.match(/[.!?]+/g)?.length || 0;
    
    // Average reading speed: 200-250 words per minute
    const readingTime = Math.max(1, Math.round(words / 200));
    // Average speaking speed: 130-150 words per minute
    const speakingTime = Math.max(1, Math.round(words / 130));

    return {
      words,
      characters,
      sentences,
      readingTime,
      speakingTime
    };
  };

  useEffect(() => {
    setStats(calculateStats(text));
  }, [text]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div className="px-4 py-3 border-b dark:border-gray-700">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center">
          <span className="mr-2">📊</span>
          Document Statistics
        </h3>
      </div>
      
      <div className="px-4 py-4 space-y-3">
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300">
          <span>Words</span>
          <span className="font-medium">{stats.words}</span>
        </div>
        
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300">
          <span>Characters</span>
          <span className="font-medium">{stats.characters}</span>
        </div>
        
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300">
          <span>Sentences</span>
          <span className="font-medium">{stats.sentences}</span>
        </div>
        
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300">
          <span>Reading Time</span>
          <span className="font-medium">{stats.readingTime} min</span>
        </div>
        
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300">
          <span>Speaking Time</span>
          <span className="font-medium">{stats.speakingTime} min</span>
        </div>
      </div>
      
      {/* Additional metrics */}
      <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700">
        <button
          onClick={() => {}}
          className="w-full rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 dark:bg-gray-600 dark:hover:bg-gray-500"
        >
          Show Detailed Report
        </button>
      </div>
    </div>
  );
};

export default StatisticsPanel;