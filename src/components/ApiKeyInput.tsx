'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { MIN_API_KEY_LENGTH } from '@/lib/constants';

interface ApiKeyInputProps {
  onApiKeyChange?: (key: string | null) => void;
  serverKeyConfigured?: boolean | null;
}

type KeyStatus = 'idle' | 'saved' | 'validating' | 'valid' | 'invalid' | 'no-server-key' | 'copied';

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

// API key format validation (MusicGPT keys are alphanumeric with hyphens/underscores)
function validateApiKeyFormat(key: string): ValidationResult {
  const trimmed = key.trim();
  
  if (!trimmed) {
    return { isValid: false, error: 'API key cannot be empty' };
  }
  
  if (trimmed.length < MIN_API_KEY_LENGTH) {
    return { isValid: false, error: `API key is too short (minimum ${MIN_API_KEY_LENGTH} characters)` };
  }
  
  // MusicGPT keys: alphanumeric with hyphens and underscores only
  const isValidChars = /^[a-zA-Z0-9_-]+$/.test(trimmed);
  if (!isValidChars) {
    return { 
      isValid: false, 
      error: 'Invalid characters. API key should contain only letters, numbers, hyphens, and underscores' 
    };
  }
  
  return { isValid: true };
}

export default function ApiKeyInput({ onApiKeyChange, serverKeyConfigured }: ApiKeyInputProps) {
  const [apiKey, setApiKey] = useState<string>('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<KeyStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isMounted, setIsMounted] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  const checkingRef = useRef(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load API key from localStorage on mount
  useEffect(() => {
    const key = localStorage.getItem('musicgpt_api_key');
    if (key) {
      // Use queueMicrotask to avoid synchronous setState in effect
      queueMicrotask(() => {
        setApiKey(key);
        onApiKeyChange?.(key);
      });
    }
    // Mark component as mounted after initial load
    queueMicrotask(() => setIsMounted(true));
  }, [onApiKeyChange]);

   // Test API key validity by fetching credits
   const testApiKey = useCallback(async (key: string): Promise<boolean> => {
     if (checkingRef.current) return false;
     checkingRef.current = true;

     try {
       const url = `/api/credits?userApiKey=${encodeURIComponent(key)}`;
       console.log('[testApiKey] Fetching:', url);
       const response = await fetch(url);

       console.log('[testApiKey] Response status:', response.status, response.statusText);
       const data = await response.json().catch(() => ({}));
       console.log('[testApiKey] Response data:', data);

       // Non-2xx => invalid key
       if (!response.ok) {
         console.log('[testApiKey] Non-2xx response, treating as invalid');
         return false;
       }

       // Success: require numeric credits and no error payload
       const credits = data?.credits;
       console.log('[testApiKey] Credits value:', credits, 'type:', typeof credits);
       
       if (typeof credits !== 'number' || Number.isNaN(credits)) {
         console.log('[testApiKey] Credits not a valid number');
         return false;
       }
       
       if (data?.error) {
         console.log('[testApiKey] Error field present:', data.error);
         return false;
       }

       console.log('[testApiKey] Key is valid');
       return true;
     } catch (err) {
       console.error('[testApiKey] Fetch error:', err);
       return false;
     } finally {
       checkingRef.current = false;
     }
   }, []);

  // Debounced validation on input change
  const debouncedValidate = useCallback((key: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    if (!key.trim()) {
      setValidationError(null);
      setStatus('idle');
      setStatusMessage('');
      return;
    }
    
    const validation = validateApiKeyFormat(key);
    if (!validation.isValid) {
      setValidationError(validation.error || 'Invalid format');
      setStatus('invalid');
      setStatusMessage(validation.error || '');
      return;
    }
    
    setValidationError(null);
    setStatus('idle');
    setStatusMessage('Press Save or hit Enter to validate');
  }, []);

  // Handle input change with debounced validation
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setApiKey(value);
    
    if (status !== 'idle') {
      setStatus('idle');
      setStatusMessage('');
    }
    
    debouncedValidate(value);
  }, [status, debouncedValidate]);

  // Save API key to localStorage
  const handleSave = useCallback(async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;

    const validation = validateApiKeyFormat(trimmed);
    if (!validation.isValid) {
      setStatus('invalid');
      setStatusMessage(validation.error || 'Invalid format');
      setValidationError(validation.error || 'Invalid format');
      return;
    }

    // Cancel any pending debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    setStatus('validating');
    setStatusMessage('Validating API key...');
    setValidationError(null);

     const isValid = await testApiKey(trimmed);

     if (isValid) {
       localStorage.setItem('musicgpt_api_key', trimmed);
       setStatus('valid');
       setStatusMessage('API key validated and saved ✓');
       onApiKeyChange?.(trimmed);
       setTimeout(() => {
         setStatus('saved');
         setStatusMessage('');
       }, 2000);
     } else {
       setStatus('invalid');
       setStatusMessage('Invalid API key or unable to verify. Check console for details.');
       setValidationError('API key validation failed');
     }
  }, [apiKey, testApiKey, onApiKeyChange]);

  // Clear API key
  const handleClear = useCallback(() => {
    localStorage.removeItem('musicgpt_api_key');
    setApiKey('');
    setStatus('idle');
    setStatusMessage('');
    setValidationError(null);
    setCopied(false);
    onApiKeyChange?.(null);
    inputRef.current?.focus();
  }, [onApiKeyChange]);

  // Test API key without saving
  const handleTest = useCallback(async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;

    const validation = validateApiKeyFormat(trimmed);
    if (!validation.isValid) {
      setStatus('invalid');
      setStatusMessage(validation.error || 'Invalid format');
      setValidationError(validation.error || 'Invalid format');
      return;
    }

     setStatus('validating');
     setStatusMessage('Validating API key...');
     setValidationError(null);

    const isValid = await testApiKey(trimmed);

     if (isValid) {
       setStatus('valid');
       setStatusMessage('API key is valid ✓');
     } else {
       setStatus('invalid');
       setStatusMessage('Invalid API key or unable to verify. Check console for details.');
       setValidationError('Validation failed');
     }
  }, [apiKey, testApiKey]);

  // Copy to clipboard with feedback
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setStatusMessage('Copied to clipboard');
      setTimeout(() => {
        setCopied(false);
        setStatusMessage('');
      }, 2000);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = apiKey;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setStatusMessage('Copied to clipboard');
      setTimeout(() => {
        setCopied(false);
        setStatusMessage('');
      }, 2000);
    }
  }, [apiKey]);

  // Keyboard shortcut (Enter to save)
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && apiKey.trim()) {
      e.preventDefault();
      handleSave();
    }
  }, [apiKey, handleSave]);

  const hasKey = !!apiKey;
  const isSaved = status === 'saved' || status === 'valid';

  // SVG Icons as components
  const icons = {
    'check-circle': (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
      </svg>
    ),
    'alert-circle': (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>
    ),
    'loader': (
      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
    ),
    'alert-triangle': (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2L1 21h22L12 2zm0 4l7.53 13H4.47L12 6z"/>
      </svg>
    ),
    'check': (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
      </svg>
    ),
    'copy': (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
      </svg>
    ),
    'key': (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M7 14l-1.41 1.41L9.17 11H3v2h6.17l-3.58 3.59L7 18l5-5zM21 4v16H5V4h16z"/>
      </svg>
    ),
    'eye': (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
    'eye-off': (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a10.058 10.058 0 013.083-3.083M9.88 9.88a3 3 0 104.24 4.24M9.88 9.88L9.88 9.88M12 5vM12 5l3.5 3.5" />
      </svg>
    ),
  };

  // Pause icon animations for loader
  const isProcessing = status === 'validating';

  // Suppress hydration mismatch by only rendering interactive UI after mount
  if (!isMounted) {
    return (
      <div className="border-t border-gray-800 pt-4 mt-4">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          MusicGPT API Key
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="password"
              value=""
              readOnly
              placeholder="Enter your MusicGPT API key"
              className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-lg text-white placeholder-gray-500 transition-all"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1" />
          </div>
          <button
            type="button"
            disabled
            className="px-4 py-2 bg-cyan-600/50 text-white rounded-lg font-medium transition-colors opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-800/50 pt-4 mt-4 space-y-3">
      {/* Label with icon and server key indicator */}
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-300 flex items-center gap-2">
          <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L12 17h-5M12 2a10 10 0 00-10 10 10 10 0 0010-10z" />
          </svg>
          MusicGPT API Key
        </label>
        {serverKeyConfigured === false && !hasKey && (
          <span className="text-xs text-orange-400 flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L1 21h22L12 2zm0 4l7.53 13H4.47L12 6z"/>
            </svg>
            No server MusicGPT API key configured
          </span>
        )}
      </div>

      {/* Input Group */}
      <div className="flex gap-2">
        <div className="relative flex-1 group">
          <input
            ref={inputRef}
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              // Final validation on blur if there's input
              if (apiKey.trim()) {
                const validation = validateApiKeyFormat(apiKey);
                if (!validation.isValid) {
                  setValidationError(validation.error || 'Invalid format');
                  setStatus('invalid');
                  setStatusMessage(validation.error || '');
                }
              }
            }}
            placeholder="Enter your MusicGPT API key"
            aria-label="MusicGPT API key"
            aria-describedby={validationError ? 'api-key-error' : statusMessage ? 'api-key-status' : undefined}
            className={`
              w-full px-3 py-2 bg-gray-800/60 border rounded-lg text-white 
              placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 
              focus:ring-offset-gray-900 pr-20 transition-all duration-200
              ${validationError 
                ? 'border-red-500/50 focus:ring-red-500/50 focus:border-red-500' 
                : status === 'valid' 
                  ? 'border-green-500/50 focus:ring-green-500/50 focus:border-green-500'
                  : status === 'validating'
                    ? 'border-yellow-500/50 focus:ring-yellow-500/50'
                    : status === 'no-server-key'
                      ? 'border-orange-500/50 focus:ring-orange-500/50 focus:border-orange-500'
                      : 'border-gray-700/50 focus:ring-cyan-500/50 focus:border-cyan-500/70'
              }
            `}
          />
          
          {/* Right icons container */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {isProcessing && (
              <div className="w-5 h-5 border-2 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin" />
            )}
            
            {/* Toggle visibility button */}
            {hasKey && !isProcessing && (
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
                title={showKey ? 'Hide API key' : 'Show API key'}
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
              >
                {showKey ? icons['eye-off'] : icons['eye']}
              </button>
            )}
            
            {/* Copy button */}
            {hasKey && !isProcessing && (
              <button
                type="button"
                onClick={handleCopy}
                className={`p-1 transition-colors ${copied ? 'text-blue-400' : 'text-gray-400 hover:text-cyan-400'}`}
                title="Copy API key to clipboard"
                aria-label="Copy API key to clipboard"
              >
                {copied ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                ) : icons['copy']
                }
              </button>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-1">
          {hasKey ? (
            <>
               <button
                 type="button"
                 onClick={handleTest}
                 disabled={isProcessing}
                 className="px-3 py-2 bg-gray-700/60 hover:bg-gray-600/80 disabled:bg-gray-800/50 disabled:text-gray-600 text-white rounded-lg font-medium transition-all text-sm"
               >
                 Validate
               </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={isProcessing}
                className="px-3 py-2 bg-gray-700/60 hover:bg-red-600/80 text-white rounded-lg font-medium transition-all text-sm disabled:opacity-50"
                aria-label="Clear API key"
              >
                Clear
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (validateApiKeyFormat(apiKey).isValid) {
                  handleSave();
                } else {
                  // Focus input and show validation
                  inputRef.current?.focus();
                }
              }}
              disabled={!apiKey.trim() || isProcessing}
              className={`
                px-4 py-2 rounded-lg font-medium transition-all text-sm
                ${status === 'valid'
                  ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-500/30'
                  : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none'
                }
              `}
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Validating...
                </span>
              ) : isSaved ? (
                'Saved'
              ) : (
                'Save'
              )}
            </button>
          )}
        </div>
      </div>

      {/* Validation/Status message */}
      {(statusMessage || validationError) && (
        <div 
          className={`
            flex items-start gap-2 p-3 rounded-lg border text-sm
            ${status === 'valid' 
              ? 'bg-green-500/10 border-green-500/30 text-green-300' 
              : status === 'invalid' || validationError
                ? 'bg-red-500/10 border-red-500/30 text-red-300'
                : status === 'validating'
                  ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300'
                  : status === 'no-server-key'
                    ? 'bg-orange-500/10 border-orange-500/30 text-orange-300'
                    : status === 'saved'
                      ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                      : copied
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                        : 'bg-gray-500/10 border-gray-500/30 text-gray-300'
            }
          `}
          role="status"
          aria-live="polite"
        >
          <div className="flex-shrink-0 mt-0.5">
            {status === 'valid' && (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            )}
            {status === 'invalid' && (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
            )}
            {status === 'validating' && (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            )}
            {status === 'no-server-key' && (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L1 21h22L12 2zm0 4l7.53 13H4.47L12 6z"/>
              </svg>
            )}
            {status === 'saved' && (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
            )}
            {copied && (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
              </svg>
            )}
          </div>
          <p className="flex-1">{statusMessage}</p>
        </div>
      )}

      {/* Format helper text */}
      {!validationError && status === 'idle' && !apiKey && (
        <p className="text-xs text-gray-500 flex items-center gap-1">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
          </svg>
          Format: alphanumeric key (typically starts with &quot;mt-&quot;) with hyphens/underscores (20+ characters)
        </p>
      )}

       {/* Getting started link */}
       <p className="text-xs text-gray-500 flex items-center gap-1">
         <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
         </svg>
         Get your API key from{' '}
         <a
           href="https://musicgpt.com"
           target="_blank"
           rel="noopener noreferrer"
           className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors"
         >
           musicgpt.com
         </a>
         {serverKeyConfigured === true && (
           <span className="ml-1 text-gray-600">(Server key configured ✓)</span>
         )}
       </p>

       {/* Security note */}
       <p className="text-xs text-gray-500 flex items-center gap-1">
         <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
           <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
         </svg>
         Your API key is encrypted during transit and handled securely.
       </p>
    </div>
  );
}
