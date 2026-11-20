import React, { useState, useEffect } from 'react';
import {
  Send,
  Sparkles,
  FileText,
  UserCheck,
  Users,
} from 'lucide-react';

interface Citation {
  transcriptId: string;
  timestamp: string;
  speakerLabel: string;
  isPrimaryUser: boolean;
  topic: string;
  snippet: string;
}

interface ConversationItem {
  id: string;
  question: string;
  answer: string;
  citations: Citation[];
  createdAt: string;
}

const SUGGESTED_QUESTIONS = [
  'How many words did I speak today vs other detected voices?',
  'Which filler words do I use most frequently and what triggers them?',
  'Who are the other predicted voices detected in my recordings?',
  'What decisions and commitments did I mention today?',
  'What did I say about the Raspberry Pi SQLite architecture?',
  'Compare my speaking habits and filler rate across sessions.',
];

export const AIAssistantChat: React.FC = () => {
  const [question, setQuestion] = useState('');
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/ai/conversations')
      .then((r) => r.json())
      .then((d) => setConversations(d.conversations || []))
      .catch(() => {});
  }, []);

  const askQuestion = async (qText: string) => {
    const clean = qText.trim();
    if (!clean || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: clean }),
      });
      if (res.ok) {
        const item = await res.json();
        setConversations((prev) => [item, ...prev]);
        setQuestion('');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    askQuestion(question);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          AI Speech Database Assistant (RAG Grounded)
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Queries your stored SQLite transcripts, filler word statistics, and separated voice profiles before answering — never fabricates memories
        </p>
      </div>

      {/* Prompt Input & Suggested Queries */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask anything about your spoken words, filler triggers, or other detected voices..."
            aria-label="Ask AI Assistant about personal speech data"
            className="flex-1 min-h-[44px] rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>{loading ? 'Querying SQLite...' : 'Ask Speech AI'}</span>
          </button>
        </form>

        <div>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            Suggested Grounded Queries:
          </div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((sq) => (
              <button
                key={sq}
                type="button"
                onClick={() => askQuestion(sq)}
                className="text-left px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-xs text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60 transition-colors cursor-pointer"
              >
                {sq}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Conversation History with Verified Source Citations */}
      <div className="space-y-4">
        {conversations.length === 0 ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center">
            <Sparkles className="w-6 h-6 text-indigo-500 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Ask a Question to Query Your Personal Speech History
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              Select any suggested question above or type your own query to inspect verified transcripts, timestamps, and speaker predictions.
            </p>
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4"
            >
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Q: {conv.question}
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
                  {conv.createdAt.slice(11, 19)} UTC
                </span>
              </div>

              <div className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line">
                {conv.answer}
              </div>

              {conv.citations && conv.citations.length > 0 && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <FileText className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Verified Source Transcripts & Timestamps ({conv.citations.length})</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {conv.citations.map((cit, idx) => (
                      <div
                        key={`${cit.transcriptId}-${idx}`}
                        className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-200">
                            {cit.isPrimaryUser ? (
                              <UserCheck className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Users className="w-3 h-3 text-amber-500" />
                            )}
                            {cit.speakerLabel}
                          </span>
                          <span className="font-mono tabular-nums">
                            {cit.timestamp.slice(0, 10)} {cit.timestamp.slice(11, 16)}
                          </span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-300 line-clamp-2">
                          "{cit.snippet}"
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
