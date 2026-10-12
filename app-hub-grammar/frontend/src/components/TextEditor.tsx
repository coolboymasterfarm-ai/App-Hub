import React, { useEffect, useRef, useCallback } from 'react';
import SuggestionList from './SuggestionList';
import { useDebounce } from '../hooks/useDebounce';
import { grammarService } from '../services/grammarService';

interface Suggestion {
  message: string;
  replacements: string[];
  offset: number;
  length: number;
  category: { id: string; name: string };
}

interface TextEditorProps {
  text: string;
  onTextChange: (text: string) => void;
}

const TextEditor: React.FC<TextEditorProps> = ({ 
  text, 
  onTextChange 
}) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debouncedText = useDebounce(text, 500);

  useEffect(() => {
    const checkGrammar = async () => {
      if (!debouncedText.trim()) {
        setSuggestions([]);
        return;
      }

      setIsChecking(true);
      try {
        const result = await grammarService.checkGrammar(debouncedText);
        // LanguageTool returns matches in a specific format
        const matches = result.matches || [];
        setSuggestions(matches);
      } catch (error) {
        console.error('Grammar check failed:', error);
        setSuggestions([]);
      } finally {
        setIsChecking(false);
      }
    };

    if (debouncedText) {
      checkGrammar();
    } else {
      setSuggestions([]);
      setIsChecking(false);
    }
  }, [debouncedText]);

  const handleAcceptSuggestion = (suggestion: Suggestion) => {
    onTextChange(prevText => {
      const before = prevText.slice(0, suggestion.offset);
      const after = prevText.slice(suggestion.offset + suggestion.length);
      const replacement = suggestion.replacements[0] || '';
      return before + replacement + after;
    });
  };

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(text);
      alert('Text copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
      alert('Failed to copy text to clipboard');
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onTextChange(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enter to submit/check
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      // Trigger immediate check (will happen via debounce)
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          Text Editor
        </h2>
        <button
          onClick={handleCopyToClipboard}
          disabled={!text.trim()}
          className="rounded-md bg-gray-800 px-3 py-1 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 dark:bg-gray-600 dark:hover:bg-gray-500"
        >
          Copy Text
        </button>
      </div>
      
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        className="w-full min-h-[200px] p-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 resize-y"
        placeholder="Start typing here to check grammar, spelling, and style..."
        aria-label="Text editor"
      />
      
      {isChecking && (
        <div className="flex items-center justify-center py-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-500"></div>
          <span className="ml-2 text-sm text-gray-600 dark:text-gray-300">Checking...</span>
        </div>
      )}
      
      {!isChecking && suggestions.length > 0 && (
        <SuggestionList 
          suggestions={suggestions} 
          onAccept={handleAcceptSuggestion} 
          currentText={text} 
          onTextChange={onTextChange} 
        />
      )}
      
      {!isChecking && suggestions.length === 0 && text.trim() && (
        <div className="text-center py-4 text-gray-500 dark:text-gray-400">
          No suggestions found. Your text looks good!
        </div>
      )}
    </div>
  );
};

export default TextEditor;