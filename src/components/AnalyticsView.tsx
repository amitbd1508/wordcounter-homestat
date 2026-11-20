import React, { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  Calendar,
  Clock,
  AlertTriangle,
  Sparkles,
  BookOpen,
  Activity,
  Plus,
} from 'lucide-react';

interface AnalyticsViewProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  speakerFilter: 'all' | 'primary' | 'other';
  onSpeakerFilterChange: (filter: 'all' | 'primary' | 'other') => void;
}

const TRIGGER_LABELS: Record<string, string> = {
  technical_explanation: 'Technical & Architectural Explanations',
  planning_commitment: 'Planning, Commitments & Scheduling',
  uncertainty_hedging: 'Uncertainty & Estimations',
  topic_transition: 'Clause & Topic Transitions',
  general_discourse: 'General Conversational Discourse',
};

const POSITION_LABELS: Record<string, string> = {
  sentence_start: 'Sentence Opener (Initial Hesitation)',
  mid_clause_transition: 'Mid-Clause Pivot (Conceptual Search)',
  clause_end: 'Clause Trailing Marker',
};

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  selectedDate,
  onSelectDate,
  speakerFilter,
  onSpeakerFilterChange,
}) => {
  const [subTab, setSubTab] = useState<'hourly' | 'daily' | 'weekly' | 'filler' | 'calendar'>('filler');
  const [hourlyData, setHourlyData] = useState<any[]>([]);
  const [dailyData, setDailyData] = useState<any>(null);
  const [weeklyData, setWeeklyData] = useState<any>({ days: [], calendarDays: [] });
  const [vocabFillerData, setVocabFillerData] = useState<any>(null);
  const [topics, setTopics] = useState<any[]>([]);
  const [newTopicName, setNewTopicName] = useState('');
  const [loading, setLoading] = useState(true);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const [hRes, dRes, wRes, vRes, tRes] = await Promise.all([
        fetch(`/api/statistics/hourly?date=${selectedDate}`).then((r) => r.json()),
        fetch(`/api/statistics/daily?date=${selectedDate}`).then((r) => r.json()),
        fetch('/api/statistics/weekly').then((r) => r.json()),
        fetch(`/api/vocabulary?speakerFilter=${speakerFilter}`).then((r) => r.json()),
        fetch('/api/topics').then((r) => r.json()),
      ]);

      setHourlyData(hRes.hours || []);
      setDailyData(dRes);
      setWeeklyData(wRes);
      setVocabFillerData(vRes);
      setTopics(tRes.topics || []);
    } catch (_err) {
      // handled gracefully
    } finally {
      setLoading(false);
    }
  }, [selectedDate, speakerFilter]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const handleAddCustomTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicName.trim()) return;
    const res = await fetch('/api/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTopicName.trim(), category: 'Custom' }),
    });
    if (res.ok) {
      const data = await res.json();
      setTopics(data.topics || []);
      setNewTopicName('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Speech, Vocabulary & Contextual Filler Analytics
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Deep metrics computed from persistent SQLite tables with primary vs. other voice separation
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Date Selector */}
          <div className="flex items-center gap-2">
            <label htmlFor="analytics-date-picker" className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Date:
            </label>
            <input
              id="analytics-date-picker"
              type="date"
              value={selectedDate}
              onChange={(e) => onSelectDate(e.target.value)}
              className="min-h-[38px] rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Speaker Filter */}
          <div
            role="group"
            aria-label="Analytics speaker filter"
            className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800"
          >
            <button
              type="button"
              onClick={() => onSpeakerFilterChange('all')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                speakerFilter === 'all'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              All Voices
            </button>
            <button
              type="button"
              onClick={() => onSpeakerFilterChange('primary')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                speakerFilter === 'primary'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              My Voice
            </button>
            <button
              type="button"
              onClick={() => onSpeakerFilterChange('other')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                speakerFilter === 'other'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Other Voices
            </button>
          </div>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div
        role="tablist"
        aria-label="Analytics sections"
        className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800"
      >
        {[
          { id: 'filler', label: 'Filler Word & Vocabulary Intelligence', icon: AlertTriangle },
          { id: 'hourly', label: 'Hourly Cadence (24h)', icon: Clock },
          { id: 'daily', label: 'Daily Breakdown & Topics', icon: BookOpen },
          { id: 'weekly', label: 'Weekly & Monthly Trends', icon: Activity },
          { id: 'calendar', label: 'Activity Calendar', icon: Calendar },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSubTab(tab.id as any)}
              className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {loading && !vocabFillerData ? (
        <div className="h-64 rounded-2xl bg-slate-200/60 dark:bg-slate-800/40 animate-pulse" />
      ) : (
        <>
          {/* TAB 1: EXPANDED FILLER WORD & VOCABULARY INTELLIGENCE */}
          {subTab === 'filler' && vocabFillerData && (
            <div className="space-y-6">
              {/* Top Row: Filler Frequency Chart + Trigger Context Insights */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                {/* Most Frequent Filler Words Breakdown */}
                <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Detected Filler Word Frequency & Categories
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Tracks acoustic hesitations ("um", "uh"), discourse markers ("like", "you know"), and hedging qualifiers ("basically", "sort of")
                  </p>

                  <div className="mt-4 h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={vocabFillerData.fillerBreakdown || []}
                        margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                        <XAxis dataKey="phrase" tick={{ fontSize: 11, fill: '#94A3B8' }} />
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
                        <Bar dataKey="my_count" name="My Voice" stackId="a" fill="#10B981" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="other_count" name="Other Voices" stackId="a" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                    {(vocabFillerData.fillerBreakdown || []).map((item: any) => (
                      <div key={`${item.phrase}-${item.category}`} className="py-2 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-semibold text-slate-900 dark:text-slate-100">"{item.phrase}"</span>
                          <span className="mx-1.5 text-slate-400" aria-hidden="true">·</span>
                          <span className="text-slate-500 dark:text-slate-400 capitalize">
                            {item.category.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          <span>{item.count} total</span>
                          <span className="mx-1.5 text-slate-400" aria-hidden="true">·</span>
                          <span className="text-emerald-600 dark:text-emerald-400">Mine: {item.my_count}</span>
                          <span className="mx-1.5 text-slate-400" aria-hidden="true">·</span>
                          <span className="text-amber-600 dark:text-amber-400">Others: {item.other_count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Contextual Trigger & Sentence Position Analysis */}
                <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-500" />
                      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        Contextual Trigger & Pattern Intelligence
                      </h2>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Identifies when and why filler words emerge based on surrounding clause semantics and sentence position
                    </p>

                    {/* Trigger Contexts */}
                    <div className="mt-4 space-y-3">
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Primary Cognitive & Conversational Triggers
                      </div>
                      {(vocabFillerData.fillerTriggers || []).map((trig: any) => (
                        <div
                          key={trig.triggerContext}
                          className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {TRIGGER_LABELS[trig.triggerContext] || trig.triggerContext}
                            </span>
                            <span className="font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-400">
                              {trig.count} occurrences
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            <span>Associated fillers: </span>
                            <span className="font-mono text-slate-700 dark:text-slate-300">
                              {String(trig.commonPhrases || '')
                                .split(',')
                                .map((s) => `"${s.trim()}"`)
                                .join(', ')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Syntactic Sentence Positions */}
                    <div className="mt-5 space-y-2">
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Sentence Position Distribution
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {(vocabFillerData.fillerPositions || []).map((pos: any) => (
                          <div
                            key={pos.position}
                            className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800"
                          >
                            <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                              {pos.count}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {POSITION_LABELS[pos.position] || pos.position}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Actionable Speaking Intelligence Coaching */}
                  <div className="mt-5 p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/60 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    <strong className="text-slate-900 dark:text-white">Pattern Insight:</strong> Hesitation markers (<em>"um"</em>, <em>"uh"</em>) cluster at sentence openers when initiating a response, whereas hedging qualifiers (<em>"basically"</em>, <em>"sort of"</em>, <em>"you know"</em>) trigger mid-clause during technical explanations. Replacing mid-clause qualifiers with a 400ms silent breath pause improves vocal authority.
                  </div>
                </div>
              </div>

              {/* Second Row: Filler Frequency Per Speaking Session & Over Time */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Filler Rate per Speaking Session
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Tracks filler density (%) across individual recorded conversations
                  </p>

                  <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                    {(vocabFillerData.fillerPerSession || []).map((sess: any) => (
                      <div key={sess.sessionId} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                        <div className="truncate">
                          <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {sess.title}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400">
                            <span>{sess.start_time.slice(0, 10)}</span>
                            <span className="mx-1.5" aria-hidden="true">·</span>
                            <span>{sess.primary_topic}</span>
                          </div>
                        </div>
                        <div className="text-right font-mono tabular-nums shrink-0">
                          <div className="font-semibold text-amber-600 dark:text-amber-400">
                            {sess.filler_count} fillers ({sess.filler_percentage}%)
                          </div>
                          <div className="text-slate-500">{sess.total_words} total words</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Filler Rate & Unique Vocabulary Trend Over Time */}
                <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Filler Percentage & Vocabulary Trend Over Time
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Historical daily progression of filler word percentage and unique vocabulary count
                  </p>

                  <div className="mt-4 h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={vocabFillerData.dailyFillerTrend || []}
                        margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                      >
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
                        <Line
                          type="monotone"
                          dataKey="filler_count"
                          name="Filler Count"
                          stroke="#F59E0B"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="unique_vocabulary"
                          name="Unique Words"
                          stroke="#6366F1"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Third Row: Contextual Filler Snippets & Top Vocabulary Table */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Contextual Filler Word Concordance (In-Situ Transcript Snippets)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Exact clause context surrounding each detected filler word with speaker attribution
                  </p>

                  <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                    {(vocabFillerData.recentFillerOccurrences || []).slice(0, 8).map((occ: any) => (
                      <div key={occ.id} className="py-2.5 text-xs space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-amber-600 dark:text-amber-400">
                              "{occ.phrase}"
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="text-slate-600 dark:text-slate-300 font-medium">
                              { TRIGGER_LABELS[occ.triggerContext] || occ.triggerContext }
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="text-slate-500">
                              {POSITION_LABELS[occ.position] || occ.position}
                            </span>
                          </div>
                          <span className="font-mono tabular-nums text-slate-400">
                            {occ.speakerLabel} · {occ.spokenAt.slice(0, 10)}
                          </span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300 font-mono text-[11px] bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-200/60 dark:border-slate-800">
                          "...{occ.snippet}..."
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top Non-Filler Vocabulary */}
                <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        Top Domain Vocabulary
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {vocabFillerData.totalUniqueWords} unique non-filler words stored
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                    {(vocabFillerData.topVocabulary || []).slice(0, 12).map((w: any) => (
                      <div key={w.word} className="py-2 flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{w.word}</span>
                        <div className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{w.total_count}x</span>
                          <span className="mx-1.5" aria-hidden="true">·</span>
                          <span className="text-emerald-600 dark:text-emerald-400">Me: {w.primary_user_count}</span>
                          <span className="mx-1.5" aria-hidden="true">·</span>
                          <span className="text-amber-600 dark:text-amber-400">Others: {w.other_speaker_count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: HOURLY CADENCE (24H) */}
          {subTab === 'hourly' && (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  24-Hour Speech Activity & Voice Separation ({selectedDate})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Hourly breakdown of words spoken by your primary voice versus other detected speakers
                </p>
              </div>

              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94A3B8' }} />
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
                    <Bar dataKey="primaryUserWords" name="My Voice (Words)" stackId="h" fill="#10B981" />
                    <Bar dataKey="otherSpeakerWords" name="Other Voices (Words)" stackId="h" fill="#F59E0B" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                {hourlyData
                  .filter((h) => h.wordCount > 0)
                  .map((h) => (
                    <div
                      key={h.hour}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 text-xs"
                    >
                      <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {h.label} UTC · {h.wordCount} words
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
                        {h.avgWpm} WPM · {h.fillerCount} fillers
                      </div>
                      <div className="text-indigo-600 dark:text-indigo-400 mt-0.5 truncate">{h.topTopic}</div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* TAB 3: DAILY BREAKDOWN & CUSTOM TOPICS */}
          {subTab === 'daily' && dailyData && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Topic Distribution & Custom Topic Tracker
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Automatic topic categorization across Work, Software Engineering, Technology, Family, Finance, Fitness
                </p>

                <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                  {topics.map((t) => (
                    <div key={t.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: t.color_hex }}
                          aria-hidden="true"
                        />
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{t.name}</span>
                        <span className="text-slate-400">({t.category})</span>
                      </div>
                      <div className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {t.total_words} words · {t.segment_count} segments
                      </div>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleAddCustomTopic} className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex gap-2">
                  <input
                    type="text"
                    value={newTopicName}
                    onChange={(e) => setNewTopicName(e.target.value)}
                    placeholder="Add custom topic (e.g., Robotics Research)..."
                    aria-label="New custom topic name"
                    className="flex-1 min-h-[38px] rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="submit"
                    className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Topic</span>
                  </button>
                </form>
              </div>

              <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Most Frequent Words on {selectedDate}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Separated by your primary voice vs. other speakers
                </p>

                <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                  {(dailyData.topWords || []).map((w: any) => (
                    <div key={w.word} className="py-2 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-900 dark:text-slate-100">{w.word}</span>
                      <div className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        <span>{w.count} total</span>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span className="text-emerald-600 dark:text-emerald-400">Mine: {w.my_count}</span>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span className="text-amber-600 dark:text-amber-400">Others: {w.other_count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: WEEKLY & MONTHLY TRENDS */}
          {subTab === 'weekly' && (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Weekly & Monthly Speaking Speed (WPM) & Word Volume
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Long-term speaking cadence and vocabulary growth stored on the Raspberry Pi SQLite engine
                </p>
              </div>

              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weeklyData.days || []} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
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
                    <Line type="monotone" dataKey="total_words" name="Total Words" stroke="#6366F1" strokeWidth={2.5} />
                    <Line type="monotone" dataKey="avg_wpm" name="Avg WPM" stroke="#10B981" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* TAB 5: CALENDAR INTENSITY VIEW */}
          {subTab === 'calendar' && (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Daily Speech Activity Calendar
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Tap any recorded day to load its detailed hourly statistics, transcripts, and AI summary
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {(weeklyData.calendarDays || []).map((day: any) => {
                  const isSelected = day.date_str === selectedDate;
                  const intensityClass =
                    day.total_words > 120
                      ? 'border-indigo-500/60 bg-indigo-50/60 dark:bg-indigo-950/40'
                      : day.total_words > 50
                      ? 'border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/30'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950';

                  return (
                    <button
                      key={day.date_str}
                      type="button"
                      onClick={() => {
                        onSelectDate(day.date_str);
                        setSubTab('hourly');
                      }}
                      className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${intensityClass} ${
                        isSelected ? 'ring-2 ring-indigo-500' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {day.date_str}
                        </span>
                        <span className="font-mono text-xs tabular-nums text-indigo-600 dark:text-indigo-400 font-bold">
                          {day.total_words} words
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                        <span>Me: {day.primary_user_words}w</span>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span>Others: {day.other_speaker_words}w</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        <span>{day.avg_wpm} WPM</span>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span>{day.filler_percentage}% fillers</span>
                      </div>
                      <div className="mt-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                        {day.top_topic}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
