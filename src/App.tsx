import React, { useState, useEffect, useCallback } from 'react';
import {
  Home,
  BarChart3,
  BookText,
  Bot,
  Settings,
} from 'lucide-react';
import {
  LivePartialStreamEvent,
  SegmentFinalizedEvent,
} from './types';
import { HomeDashboard } from './components/HomeDashboard';
import { AnalyticsView } from './components/AnalyticsView';
import { JournalExplorer } from './components/JournalExplorer';
import { AIAssistantChat } from './components/AIAssistantChat';
import { SettingsSystemView } from './components/SettingsSystemView';
import { PWAInstallButton } from './components/PWAInstallButton';

export default function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'analytics' | 'journal' | 'assistant' | 'settings'>('home');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [speakerFilter, setSpeakerFilter] = useState<'all' | 'primary' | 'other'>('all');
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [livePartial, setLivePartial] = useState<LivePartialStreamEvent | null>(null);
  const [liveFinalizedFeed, setLiveFinalizedFeed] = useState<SegmentFinalizedEvent[]>([]);

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard?date=${selectedDate}&speakerFilter=${speakerFilter}`);
      if (res.ok) {
        const data = await res.json();
        setDashboardData(data);
      }
    } catch (_err) {
      // handled gracefully
    }
  }, [selectedDate, speakerFilter]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Connect to real-time WebSocket stream (/api/ws)
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'partial_transcript') {
              setLivePartial(payload as LivePartialStreamEvent);
            } else if (payload.type === 'segment_finalized') {
              setLivePartial(null);
              setLiveFinalizedFeed((prev) => [payload as SegmentFinalizedEvent, ...prev.slice(0, 9)]);
              fetchDashboard();
            } else if (payload.type === 'status') {
              setDashboardData((prev: any) =>
                prev
                  ? {
                      ...prev,
                      recordingState: payload.recordingState,
                      simulationRunning: payload.simulationRunning,
                    }
                  : prev
              );
            }
          } catch (_e) {
            // ignore malformed frame
          }
        };

        ws.onclose = () => {
          reconnectTimer = setTimeout(connect, 3500);
        };
      } catch (_err) {
        // fallback if WebSocket blocked
      }
    };

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [fetchDashboard]);

  const handleRecordingStateChange = async (action: 'start' | 'pause' | 'stop') => {
    const res = await fetch(`/api/recording/${action}`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      if (action !== 'start') {
        setLivePartial(null);
      }
      setDashboardData((prev: any) =>
        prev ? { ...prev, recordingState: data.recordingState, simulationRunning: data.simulationRunning } : prev
      );
    }
  };

  const handleToggleSimulation = async (enabled: boolean) => {
    const res = await fetch('/api/recording/simulation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (res.ok) {
      const data = await res.json();
      setDashboardData((prev: any) =>
        prev ? { ...prev, recordingState: data.recordingState, simulationRunning: data.simulationRunning } : prev
      );
    }
  };

  const handleIngestManualOrMic = async (payload: {
    text: string;
    durationSeconds: number;
    speakerProfileId: string;
    pitchHz: number;
  }) => {
    const res = await fetch('/api/transcripts/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      await fetchDashboard();
    }
  };

  const handleRelabelSpeaker = async (payload: {
    speakerId: string;
    newLabel: string;
    newRole: string;
    isPrimaryUser: boolean;
  }) => {
    const res = await fetch('/api/speakers/relabel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      await fetchDashboard();
    }
  };

  const navItems: Array<{
    id: 'home' | 'analytics' | 'journal' | 'assistant' | 'settings';
    label: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'journal', label: 'Journal', icon: BookText },
    { id: 'assistant', label: 'AI Assistant', icon: Bot },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 pb-20 md:pb-8">
      {/* Strict 3-Zone Top Navigation Bar Contract */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-4 sm:px-6 h-14 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('home');
          }}
          className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
        >
          VoxPi Intelligence
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300"
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === item.id
                  ? 'text-indigo-600 dark:text-indigo-400 underline underline-offset-8 decoration-2'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: 1 primary action (PWA Install or Quick Pause/Resume) */}
        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton />
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'home' && (
          <HomeDashboard
            dashboardData={dashboardData}
            speakerFilter={speakerFilter}
            onSpeakerFilterChange={setSpeakerFilter}
            livePartial={livePartial}
            liveFinalizedFeed={liveFinalizedFeed}
            onStateChange={handleRecordingStateChange}
            onToggleSimulation={handleToggleSimulation}
            onIngestManualOrMic={handleIngestManualOrMic}
            onRelabelSpeaker={handleRelabelSpeaker}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsView
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            speakerFilter={speakerFilter}
            onSpeakerFilterChange={setSpeakerFilter}
          />
        )}

        {activeTab === 'journal' && (
          <JournalExplorer
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onTranscriptsChanged={fetchDashboard}
          />
        )}

        {activeTab === 'assistant' && <AIAssistantChat />}

        {activeTab === 'settings' && (
          <SettingsSystemView theme={theme} onToggleTheme={setTheme} />
        )}
      </main>

      {/* Fixed Bottom Navigation Bar for Mobile Ergonomics (5 Sections: Home, Analytics, Journal, AI Assistant, Settings) */}
      <nav
        aria-label="Mobile bottom navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center h-16 px-1"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`min-h-[44px] min-w-[44px] flex flex-col items-center justify-center rounded-xl transition-colors cursor-pointer ${
                active
                  ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] tracking-tight mt-0.5 whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
