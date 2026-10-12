import { useState, useEffect } from 'react';

export const useDarkMode = () => {
  const [darkMode, setDarkMode] = useState<boolean>(false);

  useEffect(() => {
    // Check for saved user preference or use system preference
    const savedMode = localStorage.getItem('darkMode');
    if (savedMode !== null) {
      setDarkMode(savedMode === 'true');
    } else {
      // Use system preference if no saved preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
      setDarkMode(prefersDark.matches);
    }
  }, []);

  useEffect(() => {
    // Save preference to localStorage
    localStorage.setItem('darkMode', String(darkMode));
    
    // Add or remove dark class from document root
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  return { darkMode, toggleDarkMode };
};