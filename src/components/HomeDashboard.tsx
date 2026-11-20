import React, { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  UserCheck,
  Users,
  Clock,
  Zap,
  BookOpen,
  MessageSquare,
  AlertCircle,
  Edit3,
  Check,
  X,
} from 'lucide-react';
import {
  DailyStat,
  SpeakerBreakdownItem,
  TranscriptRecord,
  LivePartialStreamEvent,
  SegmentFinalizedEvent,
} from '../types';
import { LiveTranscriptionMonitor } from './LiveTranscriptionMonitor';

interface HomeDashboardProps {
  dashboardData: {
    date: string;
    recordingState: 'active' | 'paused' | 'stopped';
    simulationRunning: boolean;
    today: DailyStat;
    yesterday: DailyStat;
    comparison: {
      wordsDeltaPercent: number;
      myWordsDeltaPercent: number;
      wpmDelta: number;
      fillerRateDelta: number;
    };
    weeklyTrend: DailyStat[];
    speakerBreakdown: SpeakerBreakdownItem[];
    recentTranscripts: TranscriptRecord[];
    longestSession?: {
      title: string;
      duration_seconds: number;
      total_words: number;
      avg_wpm: number;
    };
    systemHealth?: any;
  } | null;
  speakerFilter: 'all' | 'primary' | 'other';
  onSpeakerFilterChange: (filter: 'all' | 'primary' | 'other') => void;
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
  onRelabelSpeaker: (payload: {
    speakerId: string;
    newLabel: string;
    newRole: string;
    isPrimaryUser: boolean;
  }) => Promise<void>;
  onNavigateTab: (tab: 'home' | 'analytics' | 'journal' | 'assistant' | 'settings') => void;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  dashboardData,
  speakerFilter,
  onSpeakerFilterChange,
  livePartial,
  liveFinalizedFeed,
  onStateChange,
  onToggleSimulation,
  onIngestManualOrMic,
  onRelabelSpeaker,
  onNavigateTab,
}) => {
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState<string>('');
  const [editRole, setEditRole] = useState<string>('');
  const [editIsPrimary, setEditIsPrimary] = useState<boolean>(false);

  if (!dashboardData) {
    return (
      <div className="space-y-4">
        <div className="h-44 rounded-2xl bg-slate-200/70 dark:bg-slate-800/50 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-28 rounded-2xl bg-slate-200/70 dark:bg-slate-800/50 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const { today, comparison, weeklyTrend, speakerBreakdown, recentTranscripts, longestSession } = dashboardData;

  const displayedWords =
    speakerFilter === 'primary'
      ? today.primary_user_words
      : speakerFilter === 'other'
      ? today.other_speaker_words
      : today.total_words;

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remSec = sec % 60;
    if (mins === 0) return `${remSec}s`;
    return `${mins}m ${remSec}s`;
  };

  const startEditSpeaker = (spk: SpeakerBreakdownItem) => {
    setEditingSpeakerId(spk.speaker_id);
    setEditLabel(spk.speaker_label);
    setEditRole(spk.predicted_role);
    setEditIsPrimary(Boolean(spk.is_primary_user));
  };

  const saveEditSpeaker = async (speakerId: string) => {
    if (!editLabel.trim()) return;
    await onRelabelSpeaker({
      speakerId,
      newLabel: editLabel.trim(),
      newRole: editRole.trim() || 'Detected Speaker',
      isPrimaryUser: editIsPrimary,
    });
    setEditingSpeakerId(null);
  };

  return (
    <div className="space-y-6">
      {/* 1. Real-Time Transcription & Voice Separation Monitor */}
      <LiveTranscriptionMonitor
        recordingState={dashboardData.recordingState}
        simulationRunning={dashboardData.simulationRunning}
        livePartial={livePartial}
        liveFinalizedFeed={liveFinalizedFeed}
        onStateChange={onStateChange}
        onToggleSimulation={onToggleSimulation}
        onIngestManualOrMic={onIngestManualOrMic}
      />

      {/* 2. Voice Separation Filter Bar & Overview Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Daily Voice Intelligence Overview
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            <span>Date: {dashboardData.date}</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span>Primary Topic: {today.top_topic}</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span>{today.session_count} Sessions</span>
          </p>
        </div>

        {/* Segmented Control for Voice Separation */}
        <div
          role="group"
          aria-label="Filter statistics by speaker voice"
          className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 self-start"
        >
          <button
            type="button"
            onClick={() => onSpeakerFilterChange('all')}
            className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              speakerFilter === 'all'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All Voices ({today.total_words})
          </button>
          <button
            type="button"
            onClick={() => onSpeakerFilterChange('primary')}
            className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              speakerFilter === 'primary'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            My Voice Only ({today.primary_user_words})
          </button>
          <button
            type="button"
            onClick={() => onSpeakerFilterChange('other')}
            className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              speakerFilter === 'other'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Other Predicted Voices ({today.other_speaker_words})
          </button>
        </div>
      </div>

      {/* 3. Primary KPI Grid (6 Cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Words Spoken</span>
            <MessageSquare className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {displayedWords.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            <span>My Voice: {today.primary_user_words}</span>
            <span className="mx-1" aria-hidden="true">·</span>
            <span>Others: {today.other_speaker_words}</span>
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Speaking Time</span>
            <Clock className="w-4 h-4 text-sky-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatDuration(today.speaking_duration_seconds)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            <span>{today.session_count} active sessions today</span>
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Speaking Speed</span>
            <Zap className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {today.avg_wpm} <span className="text-xs font-normal text-slate-500">WPM</span>
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            <span>{comparison.wpmDelta >= 0 ? `+${comparison.wpmDelta}` : comparison.wpmDelta} WPM vs yesterday</span>
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Unique Vocabulary</span>
            <BookOpen className="w-4 h-4 text-violet-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {today.unique_vocabulary}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            <span>Distinct lemmatized words</span>
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Filler Word Rate</span>
            <AlertCircle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {today.filler_percentage}%
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            <span>{today.filler_count} filler occurrences today</span>
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Top Topic</span>
            <Users className="w-4 h-4 text-teal-500" />
          </div>
          <div className="mt-2 text-base font-bold text-slate-900 dark:text-slate-100 truncate" title={today.top_topic}>
            {today.top_topic}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
            <span>Longest: {longestSession ? `${longestSession.total_words}w` : 'N/A'}</span>
          </div>
        </div>
      </div>

      {/* 4. Two-Column Section: Voice Separation & Prediction Engine + 7-Day Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Voice Separation & Speaker Prediction Panel */}
        <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Voice Separation & Other Speaker Prediction
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Separates primary user voiceprint (132Hz anchor) from other detected voices and predicts conversational role
                </p>
              </div>
            </div>

            {/* Proportional Voice Distribution Bar */}
            {today.total_words > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs font-medium mb-1.5">
                  <span className="text-emerald-600 dark:text-emerald-400">
                    My Voice: {today.primary_user_words} words ({Math.round((today.primary_user_words / today.total_words) * 100)}%)
                  </span>
                  <span className="text-amber-600 dark:text-amber-400">
                    Other Voices: {today.other_speaker_words} words ({Math.round((today.other_speaker_words / today.total_words) * 100)}%)
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-300"
                    style={{ width: `${Math.round((today.primary_user_words / today.total_words) * 100)}%` }}
                  />
                  <div
                    className="bg-amber-500 h-full transition-all duration-300"
                    style={{ width: `${Math.round((today.other_speaker_words / today.total_words) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Detected Speaker List */}
            <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
              {speakerBreakdown.map((spk) => (
                <div key={spk.speaker_id} className="py-3 first:pt-1 last:pb-1">
                  {editingSpeakerId === spk.speaker_id ? (
                    <div className="space-y-2.5 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Speaker Label</label>
                          <input
                            type="text"
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            aria-label="Edit speaker label"
                            className="w-full rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Predicted Role</label>
                          <input
                            type="text"
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value)}
                            aria-label="Edit predicted role"
                            className="w-full rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={editIsPrimary}
                            onChange={(e) => setEditIsPrimary(e.target.checked)}
                            className="rounded border-slate-300"
                          />
                          <span>Mark as My Primary Voice</span>
                        </label>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => saveEditSpeaker(spk.speaker_id)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-medium inline-flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Save</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingSpeakerId(null)}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 inline-flex items-center gap-1"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Cancel</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                            spk.is_primary_user
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {spk.is_primary_user ? <UserCheck className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {spk.speaker_label}
                            </span>
                            <button
                              type="button"
                              onClick={() => startEditSpeaker(spk)}
                              aria-label={`Relabel ${spk.speaker_label}`}
                              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            <span>{spk.is_primary_user ? 'Verified Primary User' : `Predicted Role: ${spk.predicted_role}`}</span>
                            <span className="mx-1.5" aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">~{spk.avg_pitch_hz} Hz</span>
                            <span className="mx-1.5" aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{Math.round(spk.avg_confidence * 100)}% confidence</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right font-mono tabular-nums shrink-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {spk.total_words} words
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {spk.avg_wpm} WPM · {spk.filler_count} fillers
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Click any edit icon to customize predicted speaker names</span>
            <button
              type="button"
              onClick={() => onNavigateTab('analytics')}
              className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline cursor-pointer"
            >
              Full Filler & Voice Analytics →
            </button>
          </div>
        </div>

        {/* 7-Day Speaking Trend (My Voice vs Other Voices) */}
        <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  7-Day Word Volume Trend (My Voice vs. Other Voices)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Daily words persisted in local SQLite database across the past 7 days
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                {comparison.wordsDeltaPercent >= 0 ? `+${comparison.wordsDeltaPercent}%` : `${comparison.wordsDeltaPercent}%`} vs yesterday
              </span>
            </div>

            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyTrend} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="myVoiceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="otherVoiceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                  <XAxis
                    dataKey="date_str"
                    tickFormatter={(v) => v.slice(5)}
                    tick={{ fontSize: 11, fill: '#94A3B8' }}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#1E293B',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: '#F8FAFC',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="primary_user_words"
                    name="My Voice (Words)"
                    stroke="#10B981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#myVoiceGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="other_speaker_words"
                    name="Other Voices (Words)"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#otherVoiceGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Emerald: Primary User Voice · Amber: Other Predicted Voices</span>
            <button
              type="button"
              onClick={() => onNavigateTab('journal')}
              className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline cursor-pointer"
            >
              Explore Transcripts →
            </button>
          </div>
        </div>
      </div>

      {/* 5. Recent Diarized Speech Segments Today */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Recent Speech Segments ({speakerFilter === 'all' ? 'All Detected Voices' : speakerFilter === 'primary' ? 'My Voice Only' : 'Other Voices Only'})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Each segment includes exact word counts, speaking speed, filler percentage, and predicted voice identity
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('journal')}
            className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
          >
            View All in Journal →
          </button>
        </div>

        {recentTranscripts.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            No transcripts match the active speaker filter for today.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentTranscripts.slice(0, 6).map((tr) => (
              <div key={tr.id} className="py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1 max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono tabular-nums">{tr.start_time.slice(11, 19)} UTC</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`font-semibold ${
                        tr.is_primary_user
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {tr.speaker_label}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{tr.is_primary_user ? 'Primary User' : `Predicted: ${tr.predicted_role}`}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{tr.pitch_hz} Hz</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-medium">{tr.detected_topic}</span>
                  </div>
                  <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                    "{tr.recognized_text}"
                  </p>
                </div>

                <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                  <span>{tr.word_count} words</span>
                  <span aria-hidden="true">·</span>
                  <span>{tr.wpm} WPM</span>
                  <span aria-hidden="true">·</span>
                  <span className={tr.filler_count > 0 ? 'text-amber-600 dark:text-amber-400' : ''}>
                    {tr.filler_count} fillers ({tr.filler_percentage}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
