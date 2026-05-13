'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import ApiKeyInput from '@/components/ApiKeyInput';
import {
  FEATURED_PROMPTS,
  PROMPT_TEMPLATES,
  STYLE_SUGGESTIONS,
  MAX_POLL_ATTEMPTS,
  POLL_INTERVAL_MS,
  STORAGE_KEY_HISTORY,
  MAX_HISTORY_ENTRIES,
  LOW_CREDITS_THRESHOLD,
  CREDITS_PER_SECOND,
  DURATION_15S,
  DURATION_30S,
  DURATION_60S,
  MAX_PROMPT_LENGTH,
  MAX_NUM_OUTPUTS,
  MIN_NUM_OUTPUTS,
  ERROR_DISMISS_DELAY_MS,
  ERROR_CLEAR_DELAY_MS,
  MESSAGE_BEFORE_UNLOAD_GENERATING,
  MESSAGE_PROCESSING_DEFAULT,
  MESSAGE_SMART_EXPAND_TEMPLATE,
  MAX_PROGRESS_PERCENT,
  MIN_WORD_COUNT,
  SMART_EXPAND_MAX_WORDS,
} from '@/lib/constants';

type GenerationStatus = 'idle' | 'generating' | 'polling' | 'completed' | 'error';

interface Track {
  url: string | null;
  wavUrl: string | null;
  title: string | null;
  duration: number | null;
  version?: 'v1' | 'v2';
}

interface HistoryEntry {
  id: string;
  taskId: string;
  prompt: string;
  musicStyle?: string;
  makeInstrumental?: boolean;
  title: string | null;
    tracks: Track[];
    createdAt: number;
  }

  function estimateCost(numOutputs: number, duration: string): number {
    const base = CREDITS_PER_SECOND[duration as keyof typeof CREDITS_PER_SECOND] || 0.005;
    return Math.round((numOutputs * base * 100) / 100);
  }

function formatDuration(secs: number | null): string {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function ShimmerCard() {
  return (
    <div className="space-y-4 pt-4 border-t border-gray-800">
      {/* Header Skeleton */}
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-xl shimmer" />
        <div className="space-y-2 flex-1">
          <div className="h-5 rounded-lg shimmer w-2/3" />
          <div className="h-3 rounded-lg shimmer w-1/3" />
        </div>
      </div>

      {/* Track Tabs Skeleton */}
      <div className="flex gap-2 border-b border-gray-800 pb-3">
        <div className="h-10 rounded-lg shimmer flex-1" />
        <div className="h-10 rounded-lg shimmer flex-1" />
      </div>

      {/* Player Skeleton */}
      <div className="bg-gray-800/30 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full shimmer flex-shrink-0" />
          <div className="w-10 h-10 rounded-full shimmer flex-shrink-0" />
          <div className="flex-1 h-8 rounded-full shimmer" />
        </div>
        <div className="h-2 rounded-full shimmer" />
        <div className="flex justify-between">
          <div className="h-3 rounded shimmer w-12" />
          <div className="h-3 rounded shimmer w-12" />
        </div>
      </div>

      {/* Visualization Skeleton */}
      <div className="h-28 rounded-lg shimmer" />

      {/* Download Buttons Skeleton */}
      <div className="grid grid-cols-2 gap-2">
        <div className="h-12 rounded-xl shimmer" />
        <div className="h-12 rounded-xl shimmer" />
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [musicStyle, setMusicStyle] = useState('');
  const [makeInstrumental, setMakeInstrumental] = useState(false);
  const [numOutputs, setNumOutputs] = useState(1);
  const [outputLength, setOutputLength] = useState('30');
  const [userApiKey, setUserApiKey] = useState<string | null>(null);
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [processingMessage, setProcessingMessage] = useState('');
  const [songTitle, setSongTitle] = useState<string | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [creditsLoadFailed, setCreditsLoadFailed] = useState(false);
  const [serverKeyConfigured, setServerKeyConfigured] = useState<boolean | null>(null); // null = unknown, true/false = known
  const [tracks, setTracks] = useState<Track[]>([]);
  const [activeTrackIndex, setActiveTrackIndex] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Load API key from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('musicgpt_api_key');
    if (!savedKey) return;
    // Avoid sync state updates directly in effect body (lint rule)
    queueMicrotask(() => {
      setUserApiKey(savedKey);
    });
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_HISTORY);
      if (!stored) return;
      // Avoid sync state updates directly in effect body (lint rule)
      queueMicrotask(() => {
        setHistory(JSON.parse(stored));
      });
    } catch {
      // Avoid sync state updates directly in effect body (lint rule)
      queueMicrotask(() => {
        setHistory([]);
      });
    }
  }, []);

   const [currentTime, setCurrentTime] = useState(0);
   const [trackDuration, setTrackDuration] = useState(0);
   const [isPlaying, setIsPlaying] = useState(false);
   const [volume, setVolume] = useState(1);
   const [showErrorBanner, setShowErrorBanner] = useState(false);
   const [errorDetails, setErrorDetails] = useState<string | null>(null);
   const [shouldRefreshAudioKey, setShouldRefreshAudioKey] = useState(false);
   const [isLooping, setIsLooping] = useState(false);
   const [retryCount, setRetryCount] = useState(0);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [upgradeAvailable, setUpgradeAvailable] = useState(false);

    // Auto-dismiss errors after configured delay
    useEffect(() => {
      if (error && showErrorBanner) {
        const timer = setTimeout(() => {
          setShowErrorBanner(false);
          setErrorDetails(null);
        }, ERROR_DISMISS_DELAY_MS);
        return () => clearTimeout(timer);
      }
     }, [error, showErrorBanner]);

    // Warn before leaving if generation in progress
   useEffect(() => {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        if (status === 'polling' || status === 'generating') {
          const message = MESSAGE_BEFORE_UNLOAD_GENERATING;
          e.returnValue = message;
          return message;
        }
      };

     window.addEventListener('beforeunload', handleBeforeUnload);
     return () => window.removeEventListener('beforeunload', handleBeforeUnload);
   }, [status]);

  const pollIntervalRef = useRef<number | null>(null);
  const [pollAttempts, setPollAttempts] = useState(0);
  const msgIntervalRef = useRef<number | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const sseStartTimeRef = useRef<number | null>(null);
  const cancelSseRef = useRef<(() => void) | null>(null);
  const generationCompleteRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const errorTimeoutRef = useRef<number | null>(null);

   const textareaRef = useRef<HTMLTextAreaElement>(null);
   const visualizationRef = useRef<HTMLCanvasElement>(null);
   const progressFillRef = useRef<HTMLDivElement | null>(null);

   const analyserRef = useRef<AnalyserNode | null>(null);
   const audioContextRef = useRef<AudioContext | null>(null);
   const gainNodeRef = useRef<GainNode | null>(null);

   // Animation loop - wrapped to prevent CORS/security errors
   useEffect(() => {
     if (!isPlaying || !analyserRef.current) return;
     const canvas = visualizationRef.current;
     if (!canvas) return;
     const canvasCtx = canvas.getContext('2d');
     if (!canvasCtx) return;
     const WIDTH = canvas.width;
     const HEIGHT = canvas.height;
     const bufferLength = analyserRef.current.frequencyBinCount;
     const dataArray = new Uint8Array(bufferLength);

     let animationFrameId: number;

     const draw = () => {
       if (!analyserRef.current || !isPlaying) return;

       animationFrameId = requestAnimationFrame(draw);

       try {
         analyserRef.current.getByteFrequencyData(dataArray);
       } catch (error) {
         // CORS or decoding error - stop visualization silently
         console.debug('Visualization error (CORS or decode):', error);
         cancelAnimationFrame(animationFrameId);
         return;
       }

       canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);

       const barWidth = WIDTH / bufferLength / 2.5;
       let x = 0;

       for (let i = 0; i < bufferLength; i++) {
         const barHeight = (dataArray[i] / 255) * HEIGHT;
         canvasCtx.fillStyle = `hsl(${i * 1.2}, 70%, 50%)`;
         canvasCtx.fillRect(x, HEIGHT - barHeight, barWidth, barHeight);
         x += barWidth * 1.5;
       }
     };

     draw();

     return () => {
       cancelAnimationFrame(animationFrameId);
     };
   }, [isPlaying, trackDuration]);

  // Keep progress bar fill width in sync without JSX inline styles
  useEffect(() => {
    if (!progressFillRef.current) return;
    progressFillRef.current.style.width = `${progress}%`;
  }, [progress]);

  // Animation for error state
  useEffect(() => {
    if (showErrorBanner && !status.startsWith('error')) {
      const t = setTimeout(() => setShowErrorBanner(false), 5000);
      return () => clearTimeout(t);
    }
  }, [showErrorBanner, status]);

    // Fetch credits on mount (and when userApiKey becomes available)
    useEffect(() => {
      const fetchCredits = async () => {
        try {
          const url = userApiKey ? `/api/credits?userApiKey=${encodeURIComponent(userApiKey)}` : '/api/credits';
          const r = await fetch(url);
          const d = await r.json();
          if (d.credits != null) {
            setCredits(d.credits);
            setCreditsLoadFailed(false);
            // Valid credits from server key (userApiKey absent) indicates server key configured
            if (!userApiKey) {
              setServerKeyConfigured(true);
            }
          } else {
            setCreditsLoadFailed(true);
            // Only infer server key configuration when using server key (no userApiKey)
            if (!userApiKey) {
              const errLower = (d.error || '').toLowerCase();
              if (errLower.includes('not configured') || errLower.includes('environment')) {
                setServerKeyConfigured(false);
              }
            }
          }
        } catch {
          setCreditsLoadFailed(true);
        }
      };

      fetchCredits();
    }, [userApiKey]);


     // Cleanup on unmount - place after clearPoll definition to avoid forward ref
     useEffect(() => {
       return () => {
         // Clear polling intervals
         if (pollIntervalRef.current) {
           clearInterval(pollIntervalRef.current);
           pollIntervalRef.current = null;
         }
         if (msgIntervalRef.current) {
           clearInterval(msgIntervalRef.current);
           msgIntervalRef.current = null;
         }

         // Clear error timeout
         if (errorTimeoutRef.current) {
           clearTimeout(errorTimeoutRef.current);
           errorTimeoutRef.current = null;
         }

         // Close SSE stream if active
         if (eventSourceRef.current) {
           try {
             eventSourceRef.current.close();
           } catch {}
           eventSourceRef.current = null;
         }

         // Cancel any in-flight handlers
         cancelSseRef.current?.();
         cancelSseRef.current = null;
         sseStartTimeRef.current = null;

         // Close audio context
         if (audioContextRef.current) {
           audioContextRef.current.close();
         }
       };
     }, []);

   // Audio Web API setup - wrapped to prevent crashes from CORS or browser issues
   useEffect(() => {
     if (typeof window === 'undefined' || !audioRef.current) return;

     let ctx: AudioContext | null = null;
     let analyser: AnalyserNode | null = null;
     let gainNode: GainNode | null = null;
     let source: MediaElementAudioSourceNode | null = null;

     try {
       const AudioContextClass = window.AudioContext || ((window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
       ctx = new AudioContextClass();
       analyser = ctx.createAnalyser();
       source = ctx.createMediaElementSource(audioRef.current);
       gainNode = ctx.createGain();

       analyser.fftSize = 512;
       source.connect(analyser);
       analyser.connect(gainNode);
       gainNode.connect(ctx.destination);

       audioContextRef.current = ctx;
       analyserRef.current = analyser;
       gainNodeRef.current = gainNode;
     } catch (error) {
       console.error('Audio context setup failed:', error);
       if (ctx) {
         try { ctx.close(); } catch {}
       }
       return;
     }

     return () => {
       try {
         source?.disconnect?.();
         analyser?.disconnect?.();
         gainNode?.disconnect?.();
       } catch {}
       if (ctx) {
         ctx.close().catch(() => {});
       }
       audioContextRef.current = null;
       analyserRef.current = null;
       gainNodeRef.current = null;
     };
   }, [audioUrl]);

  // Sync volume with audio element and gain node
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
    }
  }, [volume]);

  const clearPoll = useCallback(() => {
    // Close SSE stream if active - clear onerror first to prevent spurious error handler
    if (eventSourceRef.current) {
      try {
        eventSourceRef.current.onerror = null;
        eventSourceRef.current.close();
      } catch {}
      eventSourceRef.current = null;
    }

    // Clear polling intervals
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (msgIntervalRef.current) {
      clearInterval(msgIntervalRef.current);
      msgIntervalRef.current = null;
    }

    // Cancel any in-flight handlers
    cancelSseRef.current?.();
    cancelSseRef.current = null;
    sseStartTimeRef.current = null;
  }, []);


  const saveToHistory = useCallback((entry: HistoryEntry) => {
    setHistory((prev) => {
      const updated = [entry, ...prev].slice(0, MAX_HISTORY_ENTRIES);
      try { localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  const handleGenerate = useCallback(async (isRetry: boolean = false) => {
    if (!prompt.trim()) return;

    // Prompt quality validation
    const wordCount = prompt.trim().split(/\s+/).filter(w => w.length > 0).length;
    if (wordCount < MIN_WORD_COUNT) {
      const errMsg = 'Please add more detail (at least 3 words) for better results. Try describing the mood, instruments, and setting.';
      setError(errMsg);
      setErrorDetails(errMsg);
      setShowErrorBanner(true);
      setStatus('error');
      return;
    }

    if (isRetry) {
      setRetryCount(prev => prev + 1);
    } else {
      setRetryCount(0);
    }

    clearPoll();
    setStatus('generating');
    setAudioUrl(null);
    setTaskId(null);
    setProgress(0);
    setError(null);
    setErrorDetails(null);
    setShowErrorBanner(false);
    setSongTitle(null);
    setEta(null);
    setTracks([]);
    setActiveTrackIndex(0);
    setProcessingMessage('');
    setIsPlaying(false);
    setCurrentTime(0);
    setTrackDuration(0);
    setShouldRefreshAudioKey((v) => !v);
    setUpgradeAvailable(false);
    setIsPreview(outputLength === DURATION_15S);
    generationCompleteRef.current = false; // reset completion flag

     try {
       const response = await fetch('/api/generate', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           prompt,
           music_style: musicStyle || undefined,
           make_instrumental: makeInstrumental,
           num_outputs: numOutputs.toString(),
           output_length: outputLength,
           userApiKey: userApiKey || undefined,
         }),
       });

       const data = await response.json();

       if (!response.ok || !data.taskId) {
         const rawError = data.error || 'Failed to start generation';
         const status = response.status;

         // Provide helpful, actionable error messages
         let errMsg = rawError;
         let errorTitle = 'Generation Failed';

         switch (status) {
           case 401:
             errorTitle = 'Invalid API Key';
             errMsg = 'Your MusicGPT API key is invalid. Please check your key in the settings below and try again.';
             break;
           case 402:
             errorTitle = 'Insufficient Credits';
             errMsg = 'You do not have enough credits for this generation. Please add credits to your MusicGPT account.';
             break;
           case 429:
             errorTitle = 'Rate Limit Exceeded';
             const retryIn = data.rateLimit?.resetMs ? Math.ceil((data.rateLimit.resetMs - Date.now()) / 1000) : 'a few minutes';
             errMsg = `You've hit the rate limit. Please try again in ${retryIn} seconds.`;
             break;
           case 503:
             errorTitle = 'Service Unavailable';
             errMsg = 'Cannot reach MusicGPT API. Check your network connection or try again later.';
             break;
           case 504:
             errorTitle = 'Request Timeout';
             errMsg = 'The request timed out. Please try again with a shorter prompt or smaller output.';
             break;
           case 500:
             errorTitle = 'Server Error';
             errMsg = 'An unexpected error occurred on our end. Please try again in a moment.';
             break;
           default:
             // Use raw error for other cases
             break;
         }

         // Append original error for debugging if it's more detailed
         if (rawError && !errMsg.includes(rawError) && status >= 500) {
           errMsg = `${errMsg}\n\nDetails: ${rawError}`;
         }

         setError(errorTitle);
         setErrorDetails(errMsg);
         setShowErrorBanner(true);
         setStatus('error');
         return;
       }

      setTaskId(data.taskId);
      if (data.eta) setEta(data.eta);
      setStatus('polling');
      setProgress(0);
      setPollAttempts(0);

      // SSE stream (realtime-ish updates via server push)
      const streamUrl = userApiKey
        ? `/api/status/stream/${data.taskId}?userApiKey=${encodeURIComponent(userApiKey)}`
        : `/api/status/stream/${data.taskId}`;

      // Keep a timer to enforce a max duration similar to old polling.
      if (sseStartTimeRef.current == null) sseStartTimeRef.current = Date.now();

      const sseTimer = setInterval(() => {
        const startedAt = sseStartTimeRef.current;
        if (!startedAt) return;
        const elapsedMs = Date.now() - startedAt;
        if (elapsedMs >= MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) {
          clearInterval(sseTimer);
          try {
            eventSourceRef.current?.close();
          } catch {}
          clearPoll();
          setShowErrorBanner(true);
          setError('Generation timed out. Please try again.');
          setStatus('error');
        }
      }, 1000);

      cancelSseRef.current = () => {
        clearInterval(sseTimer);
      };

      try {
        const es = new EventSource(streamUrl);
        eventSourceRef.current = es;

        const onMessage = (ev: MessageEvent) => {
          try {
            const statusData = JSON.parse(ev.data) as Record<string, unknown>;


            if (statusData.status === 'completed' && typeof statusData.audioUrl === 'string' && statusData.audioUrl) {

              clearInterval(sseTimer);
              clearPoll();

              const allTracks = Array.isArray(statusData.tracks) ? (statusData.tracks as Track[]) : [];

              setTracks(allTracks);
              setAudioUrl(allTracks[0]?.url || statusData.audioUrl);
              setSongTitle(typeof (statusData as Record<string, unknown>).title === 'string' ? ((statusData as Record<string, unknown>).title as string) : null);
              setActiveTrackIndex(0);
              setStatus('completed');
              setProgress(100);
              setProcessingMessage('');
              setIsPlaying(false);
              setCurrentTime(0);
              setTrackDuration(0);

              // Mark generation as complete to ignore subsequent SSE errors
              generationCompleteRef.current = true;

               fetch('/api/credits')
                 .then((r) => r.json())
                 .then((d) => {
                   if (d.credits != null) {
                     setCredits(d.credits);
                     setCreditsLoadFailed(false);
                   }
                 })
                 .catch((err) => {
                   // Silent failure acceptable — credits update is non-critical
                   if (process.env.NODE_ENV === 'development') {
                     console.debug('Credits refresh failed (non-critical):', err);
                   }
                 });

              saveToHistory({
                id: Date.now().toString(),
                taskId: data.taskId,
                prompt,
                musicStyle,
                makeInstrumental,
                title: typeof (statusData as Record<string, unknown>).title === 'string' ? ((statusData as Record<string, unknown>).title as string) : null,
                tracks: allTracks,
                createdAt: Date.now(),
              });

              setRetryCount(0);

              // Offer upgrade to full quality if this was a preview
               if (isPreview && outputLength === DURATION_15S && status !== 'error') {
                setIsPreview(false);
                setUpgradeAvailable(true);
              }

              try {
                es.close();
              } catch {}
            } else if (statusData.status === 'failed') {
              clearInterval(sseTimer);
              clearPoll();
              const errMsg = typeof (statusData as Record<string, unknown>).error === 'string' ? ((statusData as Record<string, unknown>).error as string) : 'Generation failed';
              setShowErrorBanner(true);
              setError(errMsg);
              setStatus('error');
              try {
                es.close();
              } catch {}
            } else {
              // Processing
               const msg = statusData.message || MESSAGE_PROCESSING_DEFAULT;
              setProcessingMessage(String(msg));


                setPollAttempts((prev) => {
                 const newAttempts = prev + 1;
                 const p = Math.min(MAX_PROGRESS_PERCENT, newAttempts * 5);
                 setProgress(p);
                 return newAttempts;
               });
            }
          } catch {
            // Ignore malformed events
          }

        };

        const onError = () => {
          // If generation already completed successfully, ignore this error
          // (EventSource fires onerror when connection closes after we call close())
          if (generationCompleteRef.current) {
            return;
          }

          clearInterval(sseTimer);
          clearPoll();
          setShowErrorBanner(true);
          setError('Failed to stream status updates');
          setStatus('error');
          try {
            es.close();
          } catch {}
        };

        es.addEventListener('message', onMessage as (ev: MessageEvent) => void);

        es.onerror = onError;

        // No-op: EventSource will keep until close.
      } catch (e) {
        clearPoll();
        setShowErrorBanner(true);
        setError(e instanceof Error ? e.message : 'Streaming error');
        setStatus('error');
      }

    } catch (err) {
      clearPoll();
      setShowErrorBanner(true);
      setError(err instanceof Error ? err.message : 'Error starting generation');
      setStatus('error');
    }
   }, [prompt, musicStyle, makeInstrumental, numOutputs, outputLength, userApiKey, status, isPreview, clearPoll, saveToHistory, setUpgradeAvailable]);

  const handleCancel = useCallback(() => {
    clearPoll();
    setStatus('idle');
    setError('Cancelled');
    setProgress(0);
    setProcessingMessage('');
    setIsPlaying(false);
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }
     errorTimeoutRef.current = window.setTimeout(() => {
       setError(null);
       errorTimeoutRef.current = null;
     }, ERROR_CLEAR_DELAY_MS);
  }, [clearPoll]);

  const handleReset = useCallback(() => {
    clearPoll();
    setStatus('idle');
    setAudioUrl(null);
    setTaskId(null);
    setProgress(0);
    setError(null);
    setErrorDetails(null);
    setShowErrorBanner(false);
    setSongTitle(null);
    setEta(null);
    setProcessingMessage('');
    setTracks([]);
    setActiveTrackIndex(0);
    setIsPlaying(false);
    setCurrentTime(0);
    setTrackDuration(0);
    setShouldRefreshAudioKey((v) => !v);
  }, [clearPoll]);

  const handleHistorySelect = useCallback((entry: HistoryEntry) => {
    clearPoll();
    setShowHistory(false);
    setTracks(entry.tracks);
    setAudioUrl(entry.tracks[0]?.url || null);
    setSongTitle(entry.title);
    setTaskId(entry.taskId);
    setPrompt(entry.prompt);
    setMusicStyle(entry.musicStyle || '');
    setMakeInstrumental(entry.makeInstrumental || false);
    setActiveTrackIndex(0);
    setStatus('completed');
    setProgress(100);
    setIsPlaying(false);
    setCurrentTime(0);
    setTrackDuration(0);
    setShouldRefreshAudioKey((v) => !v);
  }, [clearPoll]);

  const handleTrackSelect = useCallback((index: number, track: Track) => {
    try {
      if (!track || typeof track !== 'object') {
        console.warn('Invalid track object', { index, track });
        return;
      }

      // Prefer URL, fall back to WAV URL if available
      const selectedUrl = (track as Track).url || (track as Track).wavUrl;
      if (!selectedUrl) {
        console.warn(`Track ${index} has no playable URL`, track);
        return; // Guard: ignore clicks on unavailable tracks
      }

      setActiveTrackIndex(index);
      setCurrentTime(0);
      setTrackDuration(0);
      setAudioUrl(selectedUrl);
      setShouldRefreshAudioKey((v) => !v);
      // Clear any errors when switching tracks successfully
      setError(null);
      setErrorDetails(null);
      setShowErrorBanner(false);
    } catch (error) {
      console.error('Error selecting track:', error);
    }
  }, []);

   const handleFeatured = useCallback((featured: typeof FEATURED_PROMPTS[number]) => {
     setPrompt(featured.prompt);
     setMusicStyle(featured.style);
     setMakeInstrumental(false);
     setHasInteracted(true);
     textareaRef.current?.focus();
   }, []);

  const handleSmartExpand = useCallback(() => {
    const lowerPrompt = prompt.toLowerCase();
    let expanded = prompt;

    // Check for keywords and apply template
    for (const [key, template] of Object.entries(PROMPT_TEMPLATES)) {
      if (lowerPrompt.includes(key) && prompt.split(/\s+/).length < 8) {
        expanded = template;
        setPrompt(template);
        setHasInteracted(true);
        return;
      }
    }

      // Generic expansion for short prompts (2-5 words)
      const wordCount = prompt.split(/\s+/).filter(w => w.length > 0).length;
      if (wordCount >= 2 && wordCount < SMART_EXPAND_MAX_WORDS) {
        expanded = MESSAGE_SMART_EXPAND_TEMPLATE.replace('{prompt}', prompt);
        setPrompt(expanded);
        setHasInteracted(true);
      }
  }, [prompt]);

  const handleCopyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [prompt]);

   const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
     if (e.key === 'Enter' && !e.shiftKey) {
       e.preventDefault();
       const working = status === 'generating' || status === 'polling';
       if (!working && prompt.trim()) handleGenerate();
     }
   }, [status, prompt, handleGenerate]);

  const togglePlayPause = useCallback(() => {
    if (!audioRef.current) return;

    if (audioRef.current.paused) {
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.then(() => setIsPlaying(true)).catch(() => {
          setError('Audio playback failed to start');
          setShowErrorBanner(true);
        });
      }
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

   const toggleLoop = useCallback(() => {
     if (!audioRef.current) return;
     const newLoop = !audioRef.current.loop;
     audioRef.current.loop = newLoop;
     setIsLooping(newLoop);
   }, []);

   // Keyboard shortcuts - placed after all handlers are defined
   useEffect(() => {
     const handleKeyDown = (e: KeyboardEvent) => {
       if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
         if (e.key === 'Escape') {
           e.preventDefault();
           if (status === 'polling' || status === 'generating') {
             handleCancel();
           } else if (status === 'error') {
             handleReset();
           }
         }
         return;
       }

       switch (e.key) {
         case 'Enter':
           if (prompt.trim() && status !== 'generating' && status !== 'polling') {
             e.preventDefault();
             handleGenerate();
           }
           break;
         case ' ':
           if (audioUrl && status === 'completed') {
             e.preventDefault();
             togglePlayPause();
           }
           break;
         case 'Escape':
           if (status === 'polling' || status === 'generating') {
             handleCancel();
           } else if (status === 'error') {
             handleReset();
           }
           break;
       }
     };

     window.addEventListener('keydown', handleKeyDown);
     return () => window.removeEventListener('keydown', handleKeyDown);
   }, [prompt, status, audioUrl, handleGenerate, handleCancel, handleReset, togglePlayPause]);

   const isWorking = status === 'generating' || status === 'polling';
  const displayTitle = songTitle || prompt.slice(0, 40) + (prompt.length > 40 ? '...' : '');
  const currentTrack = tracks[activeTrackIndex];
  const creditsLow = credits != null && credits < LOW_CREDITS_THRESHOLD;
  const creditsDisplay = creditsLoadFailed ? '$--' : (credits != null ? `$${credits.toFixed(2)}` : '...');

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-900 text-white flex flex-col items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-8">
         {/* Header */}
         <div className="flex items-start justify-between">
           <div className="space-y-2">
             <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient">
               Ghostname
             </h1>
             <p className="text-gray-400 text-sm sm:text-base">AI-Powered Lofi Music Generator</p>
           </div>
           <div className="text-right">
             <button
               onClick={() => {
                 const url = userApiKey ? `/api/credits?userApiKey=${encodeURIComponent(userApiKey)}` : '/api/credits';
                 fetch(url)
                   .then((r) => r.json())
                   .then((d) => {
                     if (d.credits != null) {
                       setCredits(d.credits);
                       setCreditsLoadFailed(false);
                     } else {
                       setCreditsLoadFailed(true);
                     }
                   })
                   .catch(() => setCreditsLoadFailed(true));
               }}
               className={`
                 relative inline-flex items-center gap-1.5 rounded-xl px-3 py-2 transition-all
                 ${creditsLow 
                   ? 'bg-red-950/50 border-2 border-red-500/60 hover:border-red-400/80 shadow-lg shadow-red-900/50' 
                   : 'bg-gray-900/60 border border-gray-700 hover:border-cyan-500/50 hover:bg-gray-800/80'
                 }
               `}
               title="Click to refresh credits"
               aria-label={`Credits: ${creditsDisplay}`}
             >
               {creditsLow && (
                 <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full pulse-ring" aria-hidden="true" />
               )}
               <svg className={`w-4 h-4 ${creditsLow ? 'text-red-400' : 'text-cyan-400'}`} fill="currentColor" viewBox="0 0 24 24">
                 <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
               </svg>
               <span className={`text-sm font-medium ${creditsLow ? 'text-red-300' : 'text-cyan-400'}`}>
                 {creditsDisplay}
               </span>
             </button>
             {creditsLow && (
               <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                 <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                   <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                 </svg>
                 Low balance
               </p>
             )}
             {history.length > 0 && (
               <button
                 onClick={() => setShowHistory((v) => !v)}
                 className="mt-2 w-full text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center justify-center gap-1"
               >
                 {showHistory ? 'Hide' : 'Show'} history
                 <svg className={`w-3 h-3 transition-transform ${showHistory ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                 </svg>
               </button>
             )}
              </div>
            </div>

            {/* Generation Options */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="output_length" className="block text-xs font-medium text-gray-400 mb-1">
                  Duration
                </label>
                <select
                  id="output_length"
                  value={outputLength}
                  onChange={(e) => setOutputLength(e.target.value)}
                  disabled={isWorking}
                  className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 transition-all appearance-none cursor-pointer"
                 >
                   <option value={DURATION_15S}>15 seconds (fast)</option>
                   <option value={DURATION_30S}>30 seconds</option>
                   <option value={DURATION_60S}>60 seconds (high quality)</option>
                 </select>
              </div>
              <div>
                <label htmlFor="num_outputs" className="block text-xs font-medium text-gray-400 mb-1">
                  Variations
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="num_outputs"
                    type="range"
                    min={MIN_NUM_OUTPUTS}
                    max={MAX_NUM_OUTPUTS}
                    value={numOutputs}
                    onChange={(e) => setNumOutputs(Number(e.target.value))}
                    disabled={isWorking}
                    className="flex-1 h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-cyan-400"
                  />
                  <span className="text-sm font-mono text-cyan-400 w-6 text-right">{numOutputs}</span>
                </div>
              </div>
            </div>

            {/* Cost Estimator */}
            {!isWorking && (
                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-gray-800/40 to-gray-900/40 rounded-lg border border-gray-700/50">
                  <div className="flex flex-col">
                    <span className="text-xs text-gray-400">Estimated cost</span>
                     <span className="text-[10px] text-gray-500">
                       ~{outputLength}s × {numOutputs} {numOutputs === 1 ? 'track' : 'tracks'}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-cyan-400">
                      ${estimateCost(numOutputs, outputLength).toFixed(2)}
                    </div>
                  </div>
                </div>
               )}

        {/* Error Banner - Enhanced */}
        {showErrorBanner && errorDetails && (
          <div className="relative overflow-hidden rounded-xl border border-red-800/50 bg-gradient-to-r from-red-950/80 via-red-900/60 to-rose-900/80 p-5 shadow-lg animate-slideInUp">
            {/* Decorative glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 via-transparent to-rose-500/5 pointer-events-none" />
            
            <div className="relative flex flex-wrap items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-red-200 mb-1">Generation Failed</h3>
                <p className="text-sm text-red-100/90 break-words leading-relaxed">{errorDetails}</p>
                
                {retryCount > 0 && (
                  <p className="text-xs text-red-300/70 mt-2">
                    Retry attempt {retryCount}
                  </p>
                )}
              </div>

              <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
                {status === 'error' && prompt.trim() && (
                  <button
                    onClick={() => {
                      setShowErrorBanner(false);
                      setErrorDetails(null);
                      setError(null);
                      handleGenerate(true);
                    }}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 bg-red-600/80 hover:bg-red-500 border border-red-500/50 rounded-lg text-sm font-medium text-white transition-all hover:scale-105 active:scale-95 shadow-lg shadow-red-900/50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Retry
                  </button>
                )}

                <button
                  onClick={() => {
                    setShowErrorBanner(false);
                    setErrorDetails(null);
                    setError(null);
                  }}
                  className="flex-1 sm:flex-none w-10 h-10 sm:w-auto sm:px-4 rounded-lg bg-red-900/30 hover:bg-red-800/50 border border-red-700/30 flex items-center justify-center transition-colors"
                  aria-label="Dismiss error"
                >
                  <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span className="hidden sm:inline sm:ml-2">Dismiss</span>
                 </button>
               </div>
             </div>
           </div>
         )}

        {/* History Panel */}
        {showHistory && history.length > 0 && (
          <div className="bg-gray-900/80 border border-gray-700 rounded-2xl p-4 space-y-2 fade-in-up transition-all duration-300 ease-out">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Recent Generations</p>
            {history.map((entry) => (
              <button
                key={entry.id}
                onClick={() => handleHistorySelect(entry)}
                className="w-full flex items-center gap-3 p-3 bg-gray-800/50 hover:bg-gray-700/50 rounded-xl transition-all text-left"
              >
                <svg className="w-8 h-8 text-purple-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                </svg>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{entry.title || entry.prompt.slice(0, 30)}</p>
                  <p className="text-xs text-gray-500">{new Date(entry.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            ))}
          </div>
        )}

        {/* Main Card - Enhanced */}
        <div className="relative group">
          {/* Glow effect */}
           <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-cyan-500/20 rounded-2xl blur opacity-30 group-hover:opacity-50 transition-opacity duration-500 pointer-events-none" />
          
          <div className="relative bg-gray-900/90 backdrop-blur-xl border border-gray-800/50 rounded-2xl p-6 space-y-6 shadow-2xl">
            {/* Content remains the same */}
          {/* Prompt + Style Row */}
          <div className="space-y-3">
             <div>
               <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-1.5">
                 Describe your track
               </label>
               <div className="relative">
                 <textarea
                   ref={textareaRef}
                   id="prompt"
                   value={prompt}
                   onChange={(e) => {
                     setPrompt(e.target.value);
                     if (!hasInteracted) setHasInteracted(true);
                   }}
                   onKeyDown={handleKeyDown}
                    placeholder="e.g., 'rainy night in Tokyo with vinyl crackle and mellow piano'"
                    className="w-full p-4 pr-20 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all resize-none"
                    rows={3}
                    disabled={isWorking}
                    maxLength={MAX_PROMPT_LENGTH}
                    aria-label="Describe your track"
                  />
                  {prompt.trim() && (
                    <div className="flex gap-1 absolute right-3 bottom-3">
                      <button
                        onClick={handleSmartExpand}
                        disabled={isWorking || prompt.split(/\s+/).length >= 6}
                        className="p-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-600 text-cyan-400 hover:text-cyan-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Auto-enhance your prompt with lofi details"
                        aria-label="Smart expand prompt"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </button>
                      <button
                        onClick={handleCopyPrompt}
                        className="p-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-600 text-gray-400 hover:text-white transition-colors"
                        title="Copy prompt to clipboard"
                        aria-label="Copy prompt"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <div className="flex items-center gap-2">
                    {prompt.trim() && prompt.split(/\s+/).length < 6 && (
                      <button
                        onClick={handleSmartExpand}
                        disabled={isWorking}
                        className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors disabled:opacity-50"
                        title="Auto-enhance your prompt with lofi details"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Smart Expand
                      </button>
                    )}
                    <p className="text-xs text-gray-500">
                      {!hasInteracted && (
                        <span className="flex items-center gap-1.5 opacity-80">
                          <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-600 rounded text-[10px] font-mono text-gray-300">Enter</kbd>
                          to generate
                        </span>
                      )}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500 text-right">{prompt.length}/280</p>
                </div>
              </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <label htmlFor="music_style" className="block text-xs font-medium text-gray-400 mb-1">
                  Music Style
                </label>
                <input
                  id="music_style"
                  type="text"
                  value={musicStyle}
                  onChange={(e) => setMusicStyle(e.target.value)}
                  placeholder="Lo-Fi Hip Hop"
                  list="style-suggestions"
                  className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 transition-all"
                  disabled={isWorking}
                />
                <datalist id="style-suggestions">
                  {STYLE_SUGGESTIONS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <button
                    type="button"
                    onClick={() => setMakeInstrumental((v) => !v)}
                    disabled={isWorking}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-gray-900 ${
                      makeInstrumental ? 'bg-cyan-500' : 'bg-gray-700'
                    } disabled:opacity-50`}
                    aria-checked={makeInstrumental}
                    role="switch"
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                      makeInstrumental ? 'translate-x-5' : ''
                    }`} />
                  </button>
                  <span className="text-sm text-gray-300">Instrumental</span>
                </label>
              </div>
            </div>
          </div>

          {/* Featured Prompts */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-purple-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              Featured Prompts
            </p>
            <div className="flex flex-wrap gap-2">
              {FEATURED_PROMPTS.map((fp) => {
                const [emoji, ...nameParts] = fp.label.split(' ');
                const name = nameParts.join(' ');
                return (
                  <button
                    key={fp.label}
                    onClick={() => handleFeatured(fp)}
                    disabled={isWorking}
                    className="group relative px-3 py-2 text-xs rounded-xl border border-gray-700 bg-gradient-to-br from-gray-800/60 to-gray-900/40 text-gray-300 hover:text-white hover:border-cyan-500/50 hover:from-cyan-900/30 hover:to-purple-900/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 overflow-hidden"
                  >
                    <span className="text-base group-hover:scale-110 transition-transform">{emoji}</span>
                    <span>{name}</span>
                    <span className="hidden sm:inline text-[10px] text-cyan-400/60 ml-1 px-1.5 py-0.5 bg-cyan-950/30 rounded-full border border-cyan-500/20">
                      {fp.style}
                    </span>
                    <span className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-500/5 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error Message */}
          {!showErrorBanner && error && (
            <div className="p-4 bg-red-900/30 border border-red-800 rounded-xl">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

           {/* Action Row */}
           <div className="flex gap-3">
               <button
                 onClick={() => status === 'error' ? handleReset() : status === 'polling' ? handleCancel() : handleGenerate()}
                 disabled={status === 'generating' || (!prompt.trim() && status === 'idle') || (status !== 'polling' && !userApiKey)}
                 className={`
                  relative flex-1 py-4 rounded-xl font-semibold text-lg transition-all duration-200
                  ${status === 'generating'
                    ? 'bg-gray-700 cursor-not-allowed shadow-none'
                    : status === 'polling'
                    ? 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-lg shadow-red-900/30 hover:shadow-red-800/40'
                    : status === 'error'
                    ? 'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 shadow-lg shadow-orange-900/30 hover:shadow-orange-800/40 hover:scale-[1.02] active:scale-[0.98]'
                    : 'bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 shadow-lg shadow-cyan-500/25 hover:shadow-cyan-400/40 hover:scale-[1.02] active:scale-[0.98] pulse-button'
                  }
                  focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-gray-900
                `}
               aria-label={status === 'idle' ? 'Generate Music' : status === 'generating' ? 'Generating music' : status === 'polling' ? 'Cancel generation' : status === 'error' ? 'Try again' : 'Generate another track'}
             >
               {status === 'idle' && (
                 <span className="flex items-center justify-center gap-2">
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                   </svg>
                   Generate Music
                   <span className="hidden sm:inline text-xs opacity-70 font-normal">(Enter)</span>
                 </span>
               )}
               {status === 'generating' && (
                 <span className="flex items-center justify-center gap-2">
                   <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                     <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                     <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                   </svg>
                   Starting...
                 </span>
               )}
               {status === 'polling' && (
                 <span className="flex items-center justify-center gap-2">
                   <svg className="animate-pulse h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                     <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                   </svg>
                   Cancel
                 </span>
               )}
               {status === 'completed' && (
                 <span className="flex items-center justify-center gap-2">
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                   </svg>
                   Generate Another
                 </span>
               )}
               {status === 'error' && (
                 <span className="flex items-center justify-center gap-2">
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                   </svg>
                   Try Again
                 </span>
               )}
             </button>
           </div>

          {/* Progress Bar - Enhanced */}
          {status === 'polling' && (
            <div className="space-y-4 bg-gray-800/30 border border-gray-700/50 rounded-xl p-4">
              <div className="space-y-2">
                {/* Progress Percentage */}
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-300">Generating your track</p>
                  <p className="text-sm font-bold text-cyan-400">{Math.round(progress)}%</p>
                </div>
                
                {/* Main Progress Bar */}
                <div className="w-full bg-gray-700/50 rounded-full h-3 overflow-hidden border border-gray-600/30">
                  <div
                    ref={progressFillRef}
                    className="progress-fill"
                  />
                </div>

                {/* Status Info */}
                <div className="flex justify-between items-center text-xs">
                  <p className="text-gray-400 flex items-center gap-1.5">
                    <svg className="w-3 h-3 text-cyan-400 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="2"/>
                    </svg>
                    {processingMessage || MESSAGE_PROCESSING_DEFAULT}
                  </p>
                  {eta && (
                    <p className="text-gray-500">
                      <span className="font-mono font-semibold text-cyan-400">{Math.max(1, eta - Math.floor(pollAttempts * 2))}s</span> remaining
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Shimmer while polling without audio yet */}
          {status === 'polling' && !audioUrl && <ShimmerCard />}

          {/* Audio Result */}
          {audioUrl && status === 'completed' && (
            <div className="space-y-4 pt-4 border-t border-gray-800">
              {/* Track Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative w-14 h-14 bg-gradient-to-br from-cyan-400 to-purple-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-cyan-500/30">
                    <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate text-lg">{displayTitle}</p>
                    <p className="text-xs text-cyan-400">✓ Ready to download</p>
                  </div>
                </div>
              </div>

               {/* Track Tabs - Enhanced with smooth transitions */}
               {tracks.length > 1 && (
                 <div className="flex gap-2 border-b border-gray-800 pb-3 overflow-x-auto">
                   {tracks.map((track, i) => {
                     const durationText = track.duration ? formatDuration(track.duration) : undefined;
                     const version = track.version || `v${i + 1}`;
                     const isActive = activeTrackIndex === i;
                     return (
                        <button
                          type="button"
                          key={i}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleTrackSelect(i, track);
                          }}
                          disabled={!track.url && !track.wavUrl}
                          className={`
                            relative flex-shrink-0 py-2 px-4 rounded-lg text-sm font-medium transition-all min-w-[100px]
                            ${isActive
                              ? 'bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-500/50 text-cyan-300 shadow-lg shadow-cyan-900/30'
                              : (!track.url && !track.wavUrl)
                              ? 'bg-gray-800/20 border border-gray-800 text-gray-600 cursor-not-allowed opacity-50'
                              : 'bg-gray-800/40 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 hover:bg-gray-700/40'
                            }
                          `}
                        >
                         <div className="flex flex-col items-center gap-0.5">
                           <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                             <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                           </svg>
                           <span className="text-[10px] opacity-70 uppercase tracking-wide">{version}</span>
                           <span className="text-xs truncate max-w-[80px]">{track.title || `Track ${i + 1}`}</span>
                         </div>
                         {durationText && (
                           <div className="text-[10px] opacity-60 mt-1">{durationText}</div>
                         )}
                         {isActive && (
                           <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2/3 h-1 bg-gradient-to-r from-cyan-400 to-purple-400 rounded-full shadow-lg" />
                         )}
                       </button>
                     );
                   })}
                 </div>
                )}

                {/* Upgrade to Full Quality Banner */}
                {upgradeAvailable && (
                  <div className="relative overflow-hidden rounded-xl border border-cyan-800/50 bg-gradient-to-r from-cyan-950/80 via-blue-900/60 to-purple-900/80 p-4 shadow-lg animate-slideInUp">
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-transparent to-purple-500/5 pointer-events-none" />
                    
                    <div className="relative flex items-center gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                        <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-cyan-200">
                          Upgrade to High Quality
                        </p>
                        <p className="text-xs text-cyan-100/70">
                          Get a 60-second crystal clear version with enhanced details
                        </p>
                      </div>

                       <div className="flex gap-2">
                         <button
                           onClick={() => {
                             setUpgradeAvailable(false);
                             setOutputLength('60');
                             // Defer generation to allow state update to take effect
                             setTimeout(() => handleGenerate(), 50);
                           }}
                           className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600/80 hover:bg-cyan-500 border border-cyan-500/50 rounded-lg text-sm font-medium text-white transition-all hover:scale-105 active:scale-95 shadow-lg shadow-cyan-900/50"
                         >
                           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                           </svg>
                           Upgrade (${estimateCost(1, '60').toFixed(2)})
                         </button>
                         <button
                           onClick={() => setUpgradeAvailable(false)}
                           className="px-3 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-700 border border-gray-600 text-gray-300 hover:text-white transition-colors"
                           aria-label="Dismiss upgrade offer"
                         >
                           Dismiss
                         </button>
                       </div>
                    </div>
                  </div>
                )}

               {/* Enhanced Audio Player */}
               <div className="space-y-4">
                 {/* Hidden audio element with key trigger to force re-mount and sync */}
                 <audio
                   ref={audioRef}
                   key={audioUrl + (shouldRefreshAudioKey ? '_reset' : '')}
                   controls
                   className="hidden"
                   src={audioUrl}
                   crossOrigin="anonymous"
                   preload="metadata"
                   onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                   onLoadedMetadata={(e) => setTrackDuration(e.currentTarget.duration)}
                   onEnded={() => setIsPlaying(false)}
                   onPlay={() => setIsPlaying(true)}
                   onPause={() => setIsPlaying(false)}
                   onError={() => {
                     console.error('Audio load error for URL:', audioUrl);
                     setError('Failed to load audio. The file may be unavailable or CORS-restricted.');
                     setShowErrorBanner(true);
                   }}
                 />

                 {/* Player Controls */}
                 <div className="bg-gray-800/40 backdrop-blur-sm rounded-xl p-4 space-y-3 border border-gray-700/50">
                   {/* Play/Pause and Loop */}
                   <div className="flex items-center gap-3">
                     <button
                       onClick={togglePlayPause}
                       className="group relative w-12 h-12 rounded-full bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 flex items-center justify-center flex-shrink-0 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-cyan-500/30 hover:shadow-cyan-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-gray-900"
                       title={isPlaying ? 'Pause' : 'Play'}
                       aria-label={isPlaying ? 'Pause playback' : 'Start playback'}
                     >
                       {isPlaying ? <PauseIcon /> : <PlayIcon />}
                       {isPlaying && (
                         <span className="absolute inset-0 rounded-full border-2 border-cyan-300 animate-ping opacity-75" />
                       )}
                     </button>

                     <button
                       onClick={toggleLoop}
                       className={`
                         relative w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all
                         ${isLooping
                           ? 'bg-cyan-500/20 border-2 border-cyan-500 text-cyan-400'
                           : 'bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-400 hover:text-white'
                         }
                         focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-gray-900
                       `}
                       title={isLooping ? 'Disable loop' : 'Enable loop'}
                       aria-label={isLooping ? 'Disable loop playback' : 'Enable loop playback'}
                     >
                       <svg className={`w-5 h-5 ${isLooping ? 'text-cyan-400' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                       </svg>
                       {isLooping && (
                         <span className="absolute inset-0 rounded-full border border-cyan-400/30 animate-pulse-ring" />
                       )}
                     </button>

                     {/* Volume Control */}
                     <div className="flex items-center gap-1.5 ml-auto">
                       <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                         <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                       </svg>
                       <input
                         type="range"
                         min={0}
                         max={1}
                         step={0.05}
                         value={volume}
                         onChange={(e) => setVolume(Number(e.target.value))}
                         aria-label="Volume control"
                         title="Adjust volume"
                         className="w-20 h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-cyan-400 hover:accent-cyan-300"
                       />
                     </div>
                   </div>

                  {/* Progress Bar */}
                  <div className="space-y-1.5">
                    <input
                      type="range"
                      min={0}
                      max={trackDuration || 100}
                      value={currentTime}
                      onChange={(e) => {
                        if (audioRef.current) {
                          audioRef.current.currentTime = Number(e.target.value);
                          setCurrentTime(Number(e.target.value));
                        }
                      }}
                      aria-label="Track progress"
                      title="Seek through track"
                      className="w-full h-2 bg-gray-700 rounded-full appearance-none cursor-pointer accent-cyan-400 hover:accent-cyan-300"
                    />
                    <div className="flex justify-between text-xs text-gray-400 font-medium">
                      <span className="font-mono">{formatDuration(currentTime)}</span>
                      <span className="font-mono">{formatDuration(trackDuration)}</span>
                    </div>
                  </div>
                </div>

                {/* Waveform Visualization */}
                <div className="space-y-2">
                  <div className="w-full h-28 bg-gradient-to-b from-gray-800 to-gray-900 rounded-lg border border-gray-700/50 p-3 flex items-center justify-center overflow-hidden">
                    <canvas
                      ref={visualizationRef}
                      width={300}
                      height={100}
                      className="w-full h-full rounded filter drop-shadow-lg"
                    />
                  </div>
                  <p className="text-xs text-gray-500 text-center">{isPlaying ? '🎵 Now Playing' : '▶ Press play to visualize'}</p>
                </div>
              </div>

               {/* Download Buttons - Enhanced */}
               <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-800">
                 {currentTrack?.url && (
                   <a
                     href={currentTrack.url!}
                     download={`ghostname-${taskId?.slice(-6) || 'track'}-${currentTrack.version || `v${activeTrackIndex + 1}`}.mp3`}
                     className="flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 rounded-xl font-semibold text-sm transition-all duration-200 shadow-lg shadow-green-500/25 hover:shadow-green-400/40 hover:scale-105"
                   >
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                     </svg>
                     MP3
                   </a>
                 )}
                 {currentTrack?.wavUrl && (
                   <a
                     href={currentTrack.wavUrl!}
                     download={`ghostname-${taskId?.slice(-6) || 'track'}-${currentTrack.version || `v${activeTrackIndex + 1}`}.wav`}
                     className="flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl font-semibold text-sm transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-blue-400/40 hover:scale-105"
                   >
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                     </svg>
                     WAV
                   </a>
                 )}
               </div>
            </div>
          )}
          </div>
         </div>

         {/* Server key not configured warning (only if user doesn't have a saved key) */}
         {serverKeyConfigured === false && !userApiKey && (
           <div className="mb-4 p-3 border border-orange-500/30 rounded-lg bg-orange-950/20 text-orange-200 text-xs">
             <strong>Note:</strong> No server MusicGPT API key is configured. 
             You must enter your own API key below to generate tracks.
           </div>
         )}

          <ApiKeyInput onApiKeyChange={setUserApiKey} serverKeyConfigured={serverKeyConfigured} />

        {/* Footer */}
        <p className="text-center text-gray-500 text-sm">
          Powered by MusicGPT AI
        </p>
      </div>
    </div>
  );
}