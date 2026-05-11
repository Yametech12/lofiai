'use client';

import { useState, useEffect } from 'react';

interface ApiKeySettingsProps {
  onApiKeyChange?: (key: string | null) => void;
}

export default function ApiKeySettings({ onApiKeyChange }: ApiKeySettingsProps) {
  const [apiKey, setApiKey] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);

  // Load API key from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('musicgpt_api_key');
    if (!savedKey) return;
    // Avoid sync state updates directly in effect body (lint rule)
    queueMicrotask(() => {
      setApiKey(savedKey);
    });
  }, []);


  const handleSaveApiKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem('musicgpt_api_key', apiKey);
      setIsSaved(true);
      onApiKeyChange?.(apiKey);
      setTimeout(() => setIsSaved(false), 2000);
    }
  };

  const handleClearApiKey = () => {
    localStorage.removeItem('musicgpt_api_key');
    setApiKey('');
    setIsSaved(false);
    onApiKeyChange?.(null);
  };

  const hasApiKey = !!apiKey;

  return (
    <div className="border-t border-gray-800 pt-4 mt-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full px-4 py-3 bg-gray-900/50 hover:bg-gray-900 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="text-xl">🔑</div>
          <div className="text-left">
            <div className="font-semibold text-white">MusicGPT API Key</div>
            <div className="text-xs text-gray-400">
              {hasApiKey ? '✓ API key configured' : 'No API key set'}
            </div>
          </div>
        </div>
        <div className="text-gray-400">
          {isExpanded ? '▼' : '▶'}
        </div>
      </button>

      {isExpanded && (
        <div className="mt-3 p-4 bg-gray-900/30 rounded-lg space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Enter your MusicGPT API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk_live_..."
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors pr-12"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
              >
                {showKey ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Get your API key from <a href="https://www.musicgpt.com" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">musicgpt.com</a>
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSaveApiKey}
              disabled={!apiKey.trim()}
              className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-medium transition-colors"
            >
              {isSaved ? '✓ Saved' : 'Save API Key'}
            </button>
            {hasApiKey && (
              <button
                onClick={handleClearApiKey}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3 text-sm text-blue-300">
            <div className="font-semibold mb-1">💡 How it works:</div>
            <ul className="space-y-1 text-xs">
              <li>• Add your MusicGPT API key to use your own credits</li>
              <li>• Your key is stored locally and never sent to our servers</li>
              <li>• Leave empty to use the default server API key</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
