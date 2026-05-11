'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import ApiKeySettings from '@/components/ApiKeySettings';

type GenerationStatus = 'idle' | 'generating' | 'polling' | 'completed' | 'error';

interface Track {
  url: string;
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

const FEATURED_PROMPTS = [
  { label: '🌧️ Rainy Night', prompt: 'Rainy night in Tokyo with vinyl crackle, mellow piano, and soft boom-bap drums', style: 'Lo-Fi Hip Hop' },
  { label: '☕ Coffee Shop', prompt: 'Cozy coffee shop ambience with fingerstyle guitar, lo-fi beats, and warm sunlight through windows', style: 'Lo-Fi Chill' },
  { label: '📚 Late Night Study', prompt: 'Late night study session with soft ambient pads, gentle rain, warm bass, and subtle vinyl texture', style: 'Ambient Lo-Fi' },
  { label: '🚗 Nostalgic Drive', prompt: 'Nostalgic late night highway drive with dreamy synths, slow drums, and rain on the windshield', style: 'Synthwave Lo-Fi' },
  { label: '☀️ Morning Jazz', prompt: 'Soft morning jazz café with upright bass, gentle brush drums, Rhodes piano, and rain outside', style: 'Jazz Lo-Fi' },
  { label: '🌊 Ocean Breeze', prompt: 'Relaxing ocean waves with ukulele, soft sea breeze ambience, and mellow lo-fi rhythm', style: 'Tropical Lo-Fi' },
  { label: '🏙️ Urban Twilight', prompt: 'Urban twilight cityscape with neon reflections, calm lo-fi beats, and gentle rainfall', style: 'Chillhop' },
  { label: '🌙 Midnight Dream', prompt: 'Floating through a midnight dreamscape with ethereal synths, soft trap hats, and warm pads', style: 'Dreamy Lo-Fi' },
];

const STYLE_SUGGESTIONS = [
  'Lo-Fi Hip Hop', 'Lo-Fi Chill', 'Ambient Lo-Fi', 'Jazz Lo-Fi',
  'Synthwave Lo-Fi', 'Chillhop', 'Dreamy Lo-Fi', 'Vaporwave',
  'Boombap', 'Jazzy Hip Hop', 'Chillwave', 'Bedroom Pop',
];

const MAX_POLL_ATTEMPTS = 120; // Increased from 60 to 120 (4 minutes total)
const POLL_INTERVAL_MS = 2000;
const HISTORY_KEY = 'ghostname_history';
const MAX_HISTORY = 5;
const LOW_CREDITS_THRESHOLD = 1.0;

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
      const stored = localStorage.getItem(HISTORY_KEY);
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
  const [shouldRefreshAudioKey, setShouldRefreshAudioKey] = useState(false);
  const [isLooping, setIsLooping] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [pollAttempts, setPollAttempts] = useState(0);
  const msgIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const sseStartTimeRef = useRef<number | null>(null);
  const cancelSseRef = useRef<(() => void) | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

   const textareaRef = useRef<HTMLTextAreaElement>(null);
   const visualizationRef = useRef<HTMLCanvasElement>(null);
   const progressFillRef = useRef<HTMLDivElement | null>(null);

   const analyserRef = useRef<AnalyserNode | null>(null);
   const audioContextRef = useRef<AudioContext | null>(null);
   const gainNodeRef = useRef<GainNode | null>(null);

  // Animation loop
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

    const draw = () => {
      if (!analyserRef.current || !isPlaying) return;

      requestAnimationFrame(draw);

      analyserRef.current.getByteFrequencyData(dataArray);
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
        } else {
          setCreditsLoadFailed(true);
        }
      } catch {
        setCreditsLoadFailed(true);
      }
    };

    fetchCredits();
  }, [userApiKey]);


  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (msgIntervalRef.current) clearInterval(msgIntervalRef.current);
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Audio Web API setup
  useEffect(() => {
    if (typeof window === 'undefined' || !audioRef.current) return;

    const AudioContextClass = window.AudioContext || ((window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    const ctx = new AudioContextClass();
    const analyser = ctx.createAnalyser();
    const source = ctx.createMediaElementSource(audioRef.current);
    const gainNode = ctx.createGain();

    analyser.fftSize = 512;
    source.connect(analyser);
    analyser.connect(gainNode);
    gainNode.connect(ctx.destination);

    audioContextRef.current = ctx;
    analyserRef.current = analyser;
    gainNodeRef.current = gainNode;

    return () => {
      audioContextRef.current?.close();
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
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (msgIntervalRef.current) {
      clearInterval(msgIntervalRef.current);
      msgIntervalRef.current = null;
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

    setPollAttempts(0);
    audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
    gainNodeRef.current = null;
  }, []);


  const saveToHistory = useCallback((entry: HistoryEntry) => {
    setHistory((prev) => {
      const updated = [entry, ...prev].slice(0, MAX_HISTORY);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;

    clearPoll();
    setStatus('generating');
    setAudioUrl(null);
    setTaskId(null);
    setProgress(0);
    setError(null);
    setSongTitle(null);
    setEta(null);
    setTracks([]);
    setActiveTrackIndex(0);
    setProcessingMessage('');
    setIsPlaying(false);
    setCurrentTime(0);
    setTrackDuration(0);
    setShouldRefreshAudioKey((v) => !v);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          music_style: musicStyle || undefined,
          make_instrumental: makeInstrumental,
          userApiKey: userApiKey || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.taskId) {
        throw new Error(data.error || 'Failed to start generation');
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
              setSongTitle(typeof (statusData as any).title === 'string' ? (statusData as any).title as string : null);
              setActiveTrackIndex(0);
              setStatus('completed');
              setProgress(100);
              setProcessingMessage('');
              setIsPlaying(false);
              setCurrentTime(0);
              setTrackDuration(0);

              fetch('/api/credits')
                .then((r) => r.json())
                .then((d) => {
                  if (d.credits != null) {
                    setCredits(d.credits);
                    setCreditsLoadFailed(false);
                  }
                })
                .catch(() => {});

              saveToHistory({
                id: Date.now().toString(),
                taskId: data.taskId,
                prompt,
                musicStyle,
                makeInstrumental,
                title: statusData.title || null,
                tracks: allTracks,
                createdAt: Date.now(),
              });

              try {
                es.close();
              } catch {}
            } else if (statusData.status === 'failed') {
              clearInterval(sseTimer);
              clearPoll();
              throw new Error(statusData.error || 'Generation failed');
            } else {
              // Processing
              const msg = statusData.message || 'Processing your request...';
              setProcessingMessage(String(msg));


              setPollAttempts((prev) => {
                const newAttempts = prev + 1;
                const p = Math.min(85, newAttempts * 5);
                setProgress(p);
                return newAttempts;
              });
            }
          } catch {
            // Ignore malformed events
          }

        };

        const onError = () => {
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
  }, [prompt, musicStyle, makeInstrumental, userApiKey, clearPoll, saveToHistory]);

  const handleCancel = useCallback(() => {
    clearPoll();
    setStatus('idle');
    setError('Cancelled');
    setProgress(0);
    setProcessingMessage('');
    setIsPlaying(false);
    setTimeout(() => setError(null), 3000);
  }, [clearPoll]);

  const handleReset = useCallback(() => {
    clearPoll();
    setStatus('idle');
    setAudioUrl(null);
    setTaskId(null);
    setProgress(0);
    setError(null);
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

  const handleTrackSelect = useCallback((index: number, url: string) => {
    setActiveTrackIndex(index);
    // Force audio ref reset by toggling key -> forces re-sync and events to fire correctly for isPlaying
    setCurrentTime(0);
    setTrackDuration(0);
    setAudioUrl(url);
    setShouldRefreshAudioKey((v) => !v);
  }, []);

  const handleFeatured = useCallback((featured: typeof FEATURED_PROMPTS[0]) => {
    setPrompt(featured.prompt);
    setMusicStyle(featured.style);
    setMakeInstrumental(false);
    textareaRef.current?.focus();
  }, []);

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
            <h1 className="text-5xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
              Ghostname
            </h1>
            <p className="text-gray-400">AI-Powered Lofi Music Generator</p>
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
              className={`inline-flex items-center gap-1.5 bg-gray-900/80 border rounded-xl px-3 py-2 transition-all hover:border-gray-600 ${
                creditsLow ? 'border-red-500/50' : 'border-gray-700'
              }`}
              title="Click to refresh"
            >
              <svg className={`w-4 h-4 ${creditsLow ? 'text-red-400' : 'text-cyan-400'}`} fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              <span className={`text-sm font-medium ${creditsLow ? 'text-red-400' : 'text-cyan-400'}`}>
                {creditsDisplay}
              </span>
            </button>
            {creditsLow && (
              <p className="text-xs text-red-500 mt-1">Low balance</p>
            )}
            {history.length > 0 && (
              <button
                onClick={() => setShowHistory((v) => !v)}
                className="mt-1.5 w-full text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showHistory ? 'Hide' : 'Show'} history
              </button>
            )}
          </div>
        </div>

        {/* Error Banner */}
        {showErrorBanner && (
          <div className="p-4 bg-red-900/30 border border-red-800 rounded-xl animate-pulse">
            <p className="text-red-400 text-sm">{error || 'Audio load failed. Please try another track.'}</p>
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
                  <p className="text-xs text-gray-500">{new Date(entry.createdAt).toLocaleTimeString()}</p>
                </div>
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            ))}
          </div>
        )}

        {/* Main Card */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 space-y-6 shadow-2xl">
          {/* Prompt + Style Row */}
          <div className="space-y-3">
            <div>
              <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-1.5">
                Describe your track
              </label>
              <textarea
                ref={textareaRef}
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g., 'rainy night in Tokyo with vinyl crackle and mellow piano'"
                className="w-full p-4 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all resize-none"
                rows={3}
                disabled={isWorking}
                maxLength={280}
              />
              <p className="text-xs text-gray-500 text-right mt-1">{prompt.length}/280</p>
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
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                      makeInstrumental ? 'bg-cyan-500' : 'bg-gray-700'
                    } disabled:opacity-50`}
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
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Featured</p>
            <div className="flex flex-wrap gap-2">
              {FEATURED_PROMPTS.map((fp) => (
                <button
                  key={fp.label}
                  onClick={() => handleFeatured(fp)}
                  disabled={isWorking}
                  className="px-3 py-2 text-xs rounded-xl border border-gray-700 bg-gray-800/40 text-gray-300 hover:text-white hover:border-cyan-500/50 hover:bg-cyan-500/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <span className="text-base">{fp.label.split(' ')[0]}</span>
                  <span>{fp.label.split(' ').slice(1).join(' ')}</span>
                  <span className="hidden mobile:inline text-[10px] text-cyan-400/60">{fp.style}</span>
                </button>
              ))}
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
              onClick={status === 'error' ? handleReset : status === 'polling' ? handleCancel : handleGenerate}
              disabled={isWorking ? false : !prompt.trim() && status === 'idle'}
              className={`flex-1 py-4 rounded-xl font-semibold text-lg transition-all duration-200 ${
                status === 'error'
                  ? 'bg-orange-600 hover:bg-orange-700'
                  : status === 'polling'
                  ? 'bg-red-600 hover:bg-red-700'
                  : isWorking
                  ? 'bg-gray-700 cursor-not-allowed'
                  : 'bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 shadow-lg shadow-cyan-500/25 hover:shadow-cyan-400/40'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {status === 'idle' && 'Generate Music'}
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
              {status === 'completed' && 'Generate Another'}
              {status === 'error' && 'Try Again'}
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
                    {processingMessage || 'Processing your request...'}
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

              {/* Track Tabs - Enhanced */}
              {tracks.length > 1 && (
                  <div className="flex gap-2 border-b border-gray-800 pb-3">
                    {tracks.map((track, i) => {
                      const durationText = track.duration ? formatDuration(track.duration) : undefined;
                      const version = track.version || `v${i + 1}`;
                      return (
                        <button
                          key={i}
                          onClick={() => handleTrackSelect(i, track.url)}
                          className={`py-2 px-4 rounded-lg text-sm font-medium transition-all relative ${
                            activeTrackIndex === i
                              ? 'bg-cyan-500/20 border border-cyan-500 text-cyan-400'
                              : 'bg-gray-800/30 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                            </svg>
                            <div className="flex flex-col items-start">
                              <span className="text-xs opacity-70">{version}</span>
                              <span>{track.title || `Track ${i + 1}`}</span>
                            </div>
                          </div>
                          {durationText && (
                            <div className="text-xs opacity-60 mt-0.5">{durationText}</div>
                          )}
                          {activeTrackIndex === i && (
                            <div className="absolute -bottom-1.5 left-0 right-0 h-1 bg-cyan-400 rounded-full"></div>
                          )}
                       </button>
                     );
                   })}
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
                  preload="metadata"
                  onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                  onLoadedMetadata={(e) => setTrackDuration(e.currentTarget.duration)}
                  onEnded={() => setIsPlaying(false)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onError={() => {
                    setError('Failed to load audio');
                    setShowErrorBanner(true);
                  }}
                />

                {/* Player Controls */}
                <div className="bg-gray-800/50 rounded-xl p-4 space-y-3 border border-gray-700/50">
                  {/* Play/Pause and Loop */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={togglePlayPause}
                      className="w-12 h-12 rounded-full bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 flex items-center justify-center flex-shrink-0 transition-all shadow-lg shadow-cyan-500/40 hover:shadow-cyan-400/50 hover:scale-105"
                      title={isPlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying ? <PauseIcon /> : <PlayIcon />}
                    </button>

                    <button
                      onClick={toggleLoop}
                      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                        isLooping
                          ? 'bg-cyan-500/30 border border-cyan-500'
                          : 'bg-gray-700 hover:bg-gray-600 border border-gray-600'
                      }`}
                      title={isLooping ? 'Disable loop' : 'Enable loop'}
                    >
                      <svg className={`w-5 h-5 ${isLooping ? 'text-cyan-400' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
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
                        className="w-20 h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-cyan-400"
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
                {currentTrack?.wavUrl ? (
                  <>
                    <a
                      href={currentTrack.url}
                      download={`ghostname-${taskId?.slice(-6) || 'track'}-${currentTrack.version || `v${activeTrackIndex + 1}`}.mp3`}
                      className="flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 rounded-xl font-semibold text-sm transition-all duration-200 shadow-lg shadow-green-500/25 hover:shadow-green-400/40 hover:scale-105"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      MP3
                    </a>
                    <a
                      href={currentTrack.wavUrl}
                      download={`ghostname-${taskId?.slice(-6) || 'track'}-${currentTrack.version || `v${activeTrackIndex + 1}`}.wav`}
                      className="flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl font-semibold text-sm transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-blue-400/40 hover:scale-105"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      WAV
                    </a>
                  </>
                ) : tracks.length > 1 ? (
                  tracks.map((track, i) => {
                    const version = track.version || `v${i + 1}`;
                    return (
                      <a
                        key={i}
                        href={track.url}
                        download={`ghostname-${taskId?.slice(-6) || 'track'}-${version}.mp3`}
                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 rounded-xl font-semibold text-sm transition-all duration-200 shadow-lg shadow-green-500/25"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        {version.toUpperCase()}
                      </a>
                    );
                  })
                ) : (
                  <a
                    href={audioUrl}
                    download={`ghostname-${taskId?.slice(-6) || 'track'}.mp3`}
                    className="flex-1 flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 rounded-xl font-semibold text-lg transition-all duration-200 shadow-lg shadow-green-500/25 hover:shadow-green-400/40"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download MP3
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* API Key Settings */}
        <ApiKeySettings onApiKeyChange={setUserApiKey} />

        {/* Footer */}
        <p className="text-center text-gray-500 text-sm">
          Powered by MusicGPT AI
        </p>
      </div>
    </div>
  );
}