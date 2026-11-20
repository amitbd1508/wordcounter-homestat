import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Sparkles,
  Edit3,
  Trash2,
  Check,
  X,
  Download,
  UserCheck,
  Users,
  CheckCircle2,
  HelpCircle,
  Compass,
} from 'lucide-react';
import { TranscriptRecord } from '../types';

interface JournalExplorerProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onTranscriptsChanged: () => void;
}

export const JournalExplorer: React.FC<JournalExplorerProps> = ({
  selectedDate,
  onSelectDate,
  onTranscriptsChanged,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('All');
  const [speakerFilter, setSpeakerFilter] = useState<'all' | 'primary' | 'other'>('all');
  const [filterByDate, setFilterByDate] = useState<boolean>(false);
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [topics, setTopics] = useState<string[]>(['All']);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editTopic, setEditTopic] = useState('');
  const [editIsPrimary, setEditIsPrimary] = useState(true);
  const [editSpeakerLabel, setEditSpeakerLabel] = useState('');

  const fetchJournalData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (filterByDate && selectedDate) params.set('date', selectedDate);
      if (selectedTopic !== 'All') params.set('topic', selectedTopic);
      if (speakerFilter !== 'all') params.set('speaker', speakerFilter);

      const [trRes, sumRes, topRes] = await Promise.all([
        fetch(`/api/transcripts?${params.toString()}`).then((r) => r.json()),
        fetch(`/api/summaries?date=${selectedDate}`).then((r) => r.json()),
        fetch('/api/topics').then((r) => r.json()),
      ]);

      setTranscripts(trRes.transcripts || []);
      setSummary(sumRes.summary || null);
      const topicNames = ['All', ...(topRes.topics || []).map((t: any) => t.name)];
      setTopics(Array.from(new Set(topicNames)));
    } catch (_e) {
      // handled gracefully
    }
  }, [searchQuery, filterByDate, selectedDate, selectedTopic, speakerFilter]);

  useEffect(() => {
    fetchJournalData();
  }, [fetchJournalData]);

  const handleGenerateSummary = async () => {
    setGeneratingSummary(true);
    try {
      const res = await fetch('/api/summaries/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate }),
      });
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
      }
    } finally {
      setGeneratingSummary(false);
    }
  };

  const startEdit = (tr: TranscriptRecord) => {
    setEditingId(tr.id);
    setEditText(tr.recognized_text);
    setEditTopic(tr.detected_topic);
    setEditIsPrimary(Boolean(tr.is_primary_user));
    setEditSpeakerLabel(tr.speaker_label);
  };

  const saveEdit = async (id: string) => {
    if (!editText.trim()) return;
    const res = await fetch(`/api/transcripts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recognized_text: editText.trim(),
        detected_topic: editTopic,
        is_primary_user: editIsPrimary,
        speaker_label: editSpeakerLabel.trim(),
      }),
    });
    if (res.ok) {
      setEditingId(null);
      await fetchJournalData();
      onTranscriptsChanged();
    }
  };

  const deleteTranscript = async (id: string) => {
    const res = await fetch(`/api/transcripts/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await fetchJournalData();
      onTranscriptsChanged();
    }
  };

  const highlightSearchMatch = (text: string) => {
    if (!searchQuery.trim()) return text;
    const escaped = searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === searchQuery.trim().toLowerCase() ? (
        <mark key={i} className="bg-amber-300 dark:bg-amber-500/40 text-slate-900 dark:text-white px-0.5 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const parseJsonArray = (jsonStr?: string): string[] => {
    if (!jsonStr) return [];
    try {
      return JSON.parse(jsonStr);
    } catch (_e) {
      return [];
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Personal Voice Memory, AI Daily Journal & Transcript Explorer
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            AI interpretations are linked directly to source timestamps and separated speaker voiceprints
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            aria-label="Journal summary date"
            value={selectedDate}
            onChange={(e) => onSelectDate(e.target.value)}
            className="min-h-[38px] rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={handleGenerateSummary}
            disabled={generatingSummary}
            className="min-h-[38px] px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{generatingSummary ? 'Synthesizing...' : 'Regenerate AI Summary'}</span>
          </button>
        </div>
      </div>

      {/* 1. Daily AI Summary Card */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Daily AI Intelligence Summary ({selectedDate})
            </h2>
          </div>
          {summary && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Engine: {summary.provider_used}
            </span>
          )}
        </div>

        {summary ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
              {summary.overview}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {/* Decisions */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Decisions Mentioned</span>
                </div>
                <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  {parseJsonArray(summary.decisions_json).map((d, i) => (
                    <li key={i} className="leading-relaxed">• {d}</li>
                  ))}
                </ul>
              </div>

              {/* Commitments & Plans */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                  <Compass className="w-3.5 h-3.5" />
                  <span>Plans & Commitments</span>
                </div>
                <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  {parseJsonArray(summary.commitments_json).map((c, i) => (
                    <li key={i} className="leading-relaxed">• {c}</li>
                  ))}
                </ul>
              </div>

              {/* Questions & Themes */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Questions & Recurring Themes</span>
                </div>
                <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  {parseJsonArray(summary.questions_json).map((q, i) => (
                    <li key={`q-${i}`} className="leading-relaxed">? {q}</li>
                  ))}
                  {parseJsonArray(summary.recurring_themes_json).map((t, i) => (
                    <li key={`t-${i}`} className="leading-relaxed text-slate-500">Theme: {t}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-slate-500">
            No AI summary generated for {selectedDate} yet. Click "Regenerate AI Summary" to analyze stored speech segments.
          </div>
        )}
      </div>

      {/* 2. Search & Transcript Explorer */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Searchable Transcript Explorer ({transcripts.length} Segments)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Search full text, filter by topic or separated speaker voice, edit transcriptions, or export JSON
            </p>
          </div>

          <a
            href="/api/data/export"
            download="voxpi-speech-intelligence-backup.json"
            className="min-h-[38px] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 self-start whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export All Transcripts</span>
          </a>
        </div>

        {/* Search & Filter Controls */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search keywords, decisions, fillers, or topics..."
              aria-label="Search transcripts"
              className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="md:col-span-3">
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              aria-label="Filter by topic"
              className="w-full min-h-[40px] rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            >
              {topics.map((t) => (
                <option key={t} value={t}>
                  Topic: {t}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <select
              value={speakerFilter}
              onChange={(e) => setSpeakerFilter(e.target.value as any)}
              aria-label="Filter by speaker voice"
              className="w-full min-h-[40px] rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="all">Voices: All</option>
              <option value="primary">My Voice Only</option>
              <option value="other">Other Voices Only</option>
            </select>
          </div>

          <div className="md:col-span-2 flex items-center">
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={filterByDate}
                onChange={(e) => setFilterByDate(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>Only {selectedDate}</span>
            </label>
          </div>
        </div>

        {/* Transcripts List */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {transcripts.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No speech segments match your search filters.
            </div>
          ) : (
            transcripts.map((tr) => (
              <div key={tr.id} className="py-4">
                {editingId === tr.id ? (
                  <div className="space-y-3 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Edit Transcript Text (Recalculates Word Count, WPM & Fillers)
                      </label>
                      <textarea
                        rows={3}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        aria-label="Transcript text editor"
                        className="w-full rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2.5 text-xs text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <input
                          type="text"
                          value={editSpeakerLabel}
                          onChange={(e) => setEditSpeakerLabel(e.target.value)}
                          aria-label="Speaker label"
                          className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs"
                        />
                        <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={editIsPrimary}
                            onChange={(e) => setEditIsPrimary(e.target.checked)}
                          />
                          <span>My Primary Voice</span>
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => saveEdit(tr.id)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Save Changes</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Cancel</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300">
                          {tr.start_time.slice(0, 10)} {tr.start_time.slice(11, 19)} UTC
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-900 dark:text-slate-100">
                          {tr.is_primary_user ? (
                            <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Users className="w-3.5 h-3.5 text-amber-500" />
                          )}
                          {tr.speaker_label}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className={tr.is_primary_user ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                          {tr.is_primary_user ? 'Primary User' : `Predicted: ${tr.predicted_role}`}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{tr.pitch_hz} Hz</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                          {tr.detected_topic}
                        </span>
                      </div>

                      <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                        {highlightSearchMatch(tr.recognized_text)}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 pt-1">
                        <span>{tr.word_count} words</span>
                        <span aria-hidden="true">·</span>
                        <span>{tr.wpm} WPM</span>
                        <span aria-hidden="true">·</span>
                        <span className={tr.filler_count > 0 ? 'text-amber-600 dark:text-amber-400' : ''}>
                          {tr.filler_count} fillers ({tr.filler_percentage}%)
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Confidence: {Math.round(tr.confidence_score * 100)}%</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(tr)}
                        aria-label={`Edit transcript from ${tr.start_time}`}
                        className="min-h-[36px] min-w-[36px] p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 inline-flex items-center justify-center cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTranscript(tr.id)}
                        aria-label={`Delete transcript from ${tr.start_time}`}
                        className="min-h-[36px] min-w-[36px] p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-slate-600 hover:text-rose-600 dark:text-slate-400 inline-flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
