import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Pause,
  Play,
  Square,
  Radio,
  UserCheck,
  Users,
  Send,
  Volume2,
} from 'lucide-react';
import { LivePartialStreamEvent, SegmentFinalizedEvent } from '../types';

interface LiveTranscriptionMonitorProps {
  recordingState: 'active' | 'paused' | 'stopped';
  simulationRunning: boolean;
  livePartial: LivePartialStreamEvent | null;
  liveFinalizedFeed: SegmentFinalizedEvent[];
  onStateChange: (action: 'start' | 'pause' | 'stop') => Promise<void>;
  onToggleSimulation: (enabled: boolean) => Promise<void>;
  onIngestManualOrMic: (payload: {
    text: string;
    durationSeconds: number;
    speakerProfileId: string;
    pitchHz: number;
  }) => Promise<void>;
}

const SPEAKER_PROFILES = [
  {
    id: 'spk_primary_owner',
    label: 'My Voice (Primary User — 132Hz)',
    pitchHz: 132,
    isPrimary: true,
    role: 'Owner / Device Host',
  },
  {
    id: 'spk_guest_colleague',
    label: 'Other Voice: Tech Colleague (180Hz)',
    pitchHz: 180,
    isPrimary: false,
    role: 'Engineering Peer / Collaborator',
  },
  {
    id: 'spk_guest_partner',
    label: 'Other Voice: Family / Partner (224Hz)',
    pitchHz: 224,
    isPrimary: false,
    role: 'Household / Family Member',
  },
  {
    id: 'spk_guest_remote',
    label: 'Other Voice: Remote Caller (108Hz)',
    pitchHz: 108,
    isPrimary: false,
    role: 'External Meeting Participant',
  },
];

export const LiveTranscriptionMonitor: React.FC<LiveTranscriptionMonitorProps> = ({
  recordingState,
  simulationRunning,
  livePartial,
  liveFinalizedFeed,
  onStateChange,
  onToggleSimulation,
  onIngestManualOrMic,
}) => {
  const [selectedProfileId, setSelectedProfileId] = useState<string>('spk_primary_owner');
  const [customUtterance, setCustomUtterance] = useState<string>('');
  const [browserMicActive, setBrowserMicActive] = useState<boolean>(false);
  const [browserInterimText, setBrowserInterimText] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);

  const selectedProfile = SPEAKER_PROFILES.find((p) => p.id === selectedProfileId) || SPEAKER_PROFILES[0];

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_e) {
          // ignore
        }
      }
    };
  }, []);

  const toggleBrowserMicrophone = () => {
    if (browserMicActive) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_e) {
          // ignore
        }
      }
      setBrowserMicActive(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setCustomUtterance(
        'Um, testing live microphone capture on the Raspberry Pi node, and you know, separating my primary voice from other speakers.'
      );
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let interim = '';
        let finalStr = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalStr += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        setBrowserInterimText(interim);
        if (finalStr.trim()) {
          onIngestManualOrMic({
            text: finalStr.trim(),
            durationSeconds: Math.max(4, Math.round(finalStr.trim().split(/\s+/).length * 0.45)),
            speakerProfileId: selectedProfile.id,
            pitchHz: selectedProfile.pitchHz,
          });
          setBrowserInterimText('');
        }
      };

      recognition.onerror = () => {
        setBrowserMicActive(false);
      };

      recognition.onend = () => {
        setBrowserMicActive(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
      setBrowserMicActive(true);
    } catch (_err) {
      setBrowserMicActive(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUtterance.trim() || submitting) return;
    setSubmitting(true);
    try {
      const wordsCount = customUtterance.trim().split(/\s+/).length;
      await onIngestManualOrMic({
        text: customUtterance.trim(),
        durationSeconds: Math.max(4, Math.round(wordsCount * 0.45)),
        speakerProfileId: selectedProfile.id,
        pitchHz: selectedProfile.pitchHz,
      });
      setCustomUtterance('');
    } finally {
      setSubmitting(false);
    }
  };

  const renderHighlightedWords = (text: string) => {
    const words = text.split(' ');
    const fillerSet = new Set(['um', 'uh', 'erm', 'like', 'basically', 'actually', 'literally', 'honestly']);
    return words.map((w, idx) => {
      const clean = w.replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, '').toLowerCase();
      const isFiller = fillerSet.has(clean);
      const isLast = idx === words.length - 1;
      return (
        <span
          key={`${idx}-${w}`}
          className={`inline-block mr-1.5 transition-opacity duration-150 ${
            isFiller
              ? 'text-amber-600 dark:text-amber-400 font-semibold underline decoration-amber-500/60 underline-offset-4'
              : isLast
              ? 'text-indigo-600 dark:text-indigo-300 font-medium'
              : 'text-slate-900 dark:text-slate-100'
          }`}
        >
          {w}
        </span>
      );
    });
  };

  return (
    <section
      aria-label="Real-Time Transcription & Voice Separation Monitor"
      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5"
    >
      {/* Top Row: Live Status + Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            {recordingState === 'active' ? (
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
            ) : recordingState === 'paused' ? (
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden="true" />
            ) : (
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" aria-hidden="true" />
            )}
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Real-Time Speech Transcription & Voice Separation
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            <span>Status: {recordingState === 'active' ? 'Listening & Transcribing' : recordingState === 'paused' ? 'Paused (Privacy Mute)' : 'Stopped'}</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span>Silero VAD v5</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span>Acoustic Diarization Active</span>
          </p>
        </div>

        {/* Recording & Stream Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {recordingState !== 'active' ? (
            <button
              type="button"
              onClick={() => onStateChange('start')}
              className="min-h-[40px] px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Resume Transcription</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onStateChange('pause')}
              className="min-h-[40px] px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pause Capture</span>
            </button>
          )}

          {recordingState !== 'stopped' && (
            <button
              type="button"
              onClick={() => onStateChange('stop')}
              className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Stop</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onToggleSimulation(!simulationRunning)}
            className={`min-h-[40px] px-3 py-2 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              simulationRunning
                ? 'border-indigo-500/40 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>{simulationRunning ? 'Pi Stream Sim: ON' : 'Pi Stream Sim: OFF'}</span>
          </button>

          <button
            type="button"
            onClick={toggleBrowserMicrophone}
            className={`min-h-[40px] px-3 py-2 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              browserMicActive
                ? 'border-rose-500 bg-rose-600 text-white'
                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {browserMicActive ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            <span>{browserMicActive ? 'Stop Device Mic' : 'Use Device Mic'}</span>
          </button>
        </div>
      </div>

      {/* Live Word-by-Word Appending Feed */}
      <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-950/90 border border-slate-200/80 dark:border-slate-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <Volume2 className="w-3.5 h-3.5 text-indigo-500" />
            {recordingState === 'active' && livePartial ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {livePartial.speaker.speakerLabel}
                </span>
                <span aria-hidden="true">·</span>
                <span className={livePartial.speaker.isPrimaryUser ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-amber-600 dark:text-amber-400 font-medium'}>
                  {livePartial.speaker.isPrimaryUser ? 'Verified Owner Voiceprint' : `Predicted: ${livePartial.speaker.predictedRole}`}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {livePartial.speaker.pitchHz} Hz ({Math.round(livePartial.speaker.confidence * 100)}% match)
                </span>
              </div>
            ) : (
              <span>
                {recordingState === 'paused'
                  ? 'Transcription paused — microphone input is muted'
                  : recordingState === 'stopped'
                  ? 'Transcription stopped — click Resume Transcription to start listening'
                  : 'Waiting for voice activity...'}
              </span>
            )}
          </div>

          {recordingState === 'active' && livePartial && (
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              Word {livePartial.wordIndex} / {livePartial.totalWordsInUtterance}
            </span>
          )}
        </div>

        {/* Dynamic Live Text Stream Container */}
        <div
          data-testid="live-transcription-stream"
          className="min-h-[60px] flex items-center text-base leading-relaxed"
        >
          {browserInterimText ? (
            <p className="text-slate-900 dark:text-slate-100">
              {renderHighlightedWords(browserInterimText)}
            </p>
          ) : recordingState === 'active' && livePartial ? (
            <p className="text-slate-900 dark:text-slate-100">
              {renderHighlightedWords(livePartial.partialText)}
              <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-indigo-500 animate-pulse" aria-hidden="true" />
            </p>
          ) : (
            <p className="text-sm text-slate-400 dark:text-slate-500 italic">
              {recordingState === 'active'
                ? 'Listening for speech segments on USB Microphone (Silero VAD active)...'
                : 'Live word stream is currently paused.'}
            </p>
          )}
        </div>

        {/* Recent Finalized Utterances in current stream */}
        {liveFinalizedFeed.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-200/70 dark:border-slate-800/80 space-y-2">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Recently Transcribed & Diarized Segments
            </div>
            {liveFinalizedFeed.slice(0, 2).map((seg) => (
              <div
                key={seg.transcriptId}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs py-1.5 border-b border-slate-100 dark:border-slate-800/60 last:border-none"
              >
                <div className="flex items-start gap-2">
                  {seg.speaker.isPrimaryUser ? (
                    <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <Users className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {seg.speaker.speakerLabel}:
                    </span>{' '}
                    <span className="text-slate-600 dark:text-slate-300">"{seg.text}"</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-mono tabular-nums shrink-0">
                  <span>{seg.wordCount}w</span>
                  <span aria-hidden="true">·</span>
                  <span>{seg.wpm} WPM</span>
                  <span aria-hidden="true">·</span>
                  <span>{seg.detectedTopic}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Interactive Voice Separation & Utterance Simulator Form */}
      <form onSubmit={handleManualSubmit} className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
          <div className="md:col-span-4">
            <label
              htmlFor="speaker-voice-select"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
            >
              Simulate / Test Voice Separation Profile
            </label>
            <select
              id="speaker-voice-select"
              value={selectedProfileId}
              onChange={(e) => setSelectedProfileId(e.target.value)}
              className="w-full min-h-[40px] rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {SPEAKER_PROFILES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-6">
            <label
              htmlFor="live-utterance-input"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
            >
              Inject Spoken Utterance (Tests Word Count, Fillers & Voice Prediction)
            </label>
            <input
              id="live-utterance-input"
              type="text"
              value={customUtterance}
              onChange={(e) => setCustomUtterance(e.target.value)}
              placeholder="e.g., Um, we basically decided to index the SQLite timestamps today..."
              className="w-full min-h-[40px] rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={submitting || !customUtterance.trim()}
              className="w-full min-h-[40px] px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Transcribe</span>
            </button>
          </div>
        </div>
      </form>
    </section>
  );
};
