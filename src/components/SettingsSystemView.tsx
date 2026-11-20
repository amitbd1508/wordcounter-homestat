import React, { useState, useEffect } from 'react';
import {
  Cpu,
  HardDrive,
  Mic,
  Shield,
  Save,
  Download,
  Terminal,
  Sun,
  Moon,
  Check,
} from 'lucide-react';

interface SettingsSystemViewProps {
  theme: 'light' | 'dark';
  onToggleTheme: (nextTheme: 'light' | 'dark') => void;
}

export const SettingsSystemView: React.FC<SettingsSystemViewProps> = ({
  theme,
  onToggleTheme,
}) => {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [tableCounts, setTableCounts] = useState<Record<string, number>>({});
  const [events, setEvents] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const loadSettingsAndHealth = async () => {
    try {
      const [sRes, hRes] = await Promise.all([
        fetch('/api/settings').then((r) => r.json()),
        fetch('/api/system/health').then((r) => r.json()),
      ]);
      setSettings(sRes.settings || {});
      setSystemHealth(hRes.health || null);
      setTableCounts(hRes.tableCounts || {});
      setEvents(hRes.events || []);
    } catch (_e) {
      // handled gracefully
    }
  };

  useEffect(() => {
    loadSettingsAndHealth();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        setSavedNotice(true);
        setTimeout(() => setSavedNotice(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  const updateField = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Raspberry Pi Node Health, Privacy & System Settings
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Configure USB microphone capture, Silero VAD, voiceprint separation, AI processing mode, and SQLite backups
          </p>
        </div>

        {/* Light / Dark Theme Switcher */}
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 self-start">
          <button
            type="button"
            onClick={() => onToggleTheme('light')}
            className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              theme === 'light'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
            <span>Light Theme</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleTheme('dark')}
            className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              theme === 'dark'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Moon className="w-3.5 h-3.5" />
            <span>Dark Theme</span>
          </button>
        </div>
      </div>

      {/* 1. Raspberry Pi Hardware & SQLite Telemetry Grid */}
      {systemHealth && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Host Hardware</span>
              <Cpu className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {systemHealth.pi_model}
            </div>
            <div className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              <span>CPU: {systemHealth.cpu_usage_percent}%</span>
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span>Temp: {systemHealth.cpu_temp_celsius}°C</span>
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Memory & Storage</span>
              <HardDrive className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-2 text-sm font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              RAM: {systemHealth.ram_used_mb} / {systemHealth.ram_total_mb} MB
            </div>
            <div className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              <span>NVMe/SD: {systemHealth.storage_used_gb} / {systemHealth.storage_total_gb} GB</span>
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>USB Microphone & VAD</span>
              <Mic className="w-4 h-4 text-sky-500" />
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {systemHealth.microphone_device}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              <span>{systemHealth.vad_engine}</span>
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span className="capitalize">{systemHealth.microphone_status}</span>
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>SQLite WAL Database</span>
              <Shield className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-2 text-sm font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {tableCounts.words || 0} indexed words
            </div>
            <div className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              <span>{tableCounts.transcripts || 0} segments</span>
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span>{tableCounts.filler_word_statistics || 0} fillers</span>
            </div>
          </div>
        </div>
      )}

      {/* 2. Configuration Form */}
      <form
        onSubmit={handleSaveSettings}
        className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-5"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Microphone, Voice Separation & AI Processing Configuration
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Changes are persisted directly to the SQLite user_settings table
            </p>
          </div>

          <div className="flex items-center gap-3">
            {savedNotice && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                <span>Settings Saved</span>
              </span>
            )}
            <button
              type="submit"
              disabled={saving}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label htmlFor="setting-mic" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              USB Microphone Device (ALSA)
            </label>
            <select
              id="setting-mic"
              value={settings.microphone_device || 'ReSpeaker 4-Mic Array (USB Audio)'}
              onChange={(e) => updateField('microphone_device', e.target.value)}
              className="w-full min-h-[40px] rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="ReSpeaker 4-Mic Array (USB Audio)">ReSpeaker 4-Mic Array (USB Audio)</option>
              <option value="Rode NT-USB Mini (ALSA hw:1,0)">Rode NT-USB Mini (ALSA hw:1,0)</option>
              <option value="Blue Yeti Nano USB Omnidirectional">Blue Yeti Nano USB Omnidirectional</option>
              <option value="Shure MV7 USB Podcast Microphone">Shure MV7 USB Podcast Microphone</option>
            </select>
          </div>

          <div>
            <label htmlFor="setting-stt" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Speech Recognition Model (Local STT)
            </label>
            <select
              id="setting-stt"
              value={settings.stt_model || 'faster-whisper-small.en (INT8 ARM64)'}
              onChange={(e) => updateField('stt_model', e.target.value)}
              className="w-full min-h-[40px] rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="faster-whisper-tiny.en (INT8 Ultra-Fast)">faster-whisper-tiny.en (INT8 Ultra-Fast)</option>
              <option value="faster-whisper-base.en (INT8 Balanced)">faster-whisper-base.en (INT8 Balanced)</option>
              <option value="faster-whisper-small.en (INT8 ARM64)">faster-whisper-small.en (INT8 ARM64)</option>
              <option value="faster-whisper-medium (Multilingual)">faster-whisper-medium (Multilingual)</option>
            </select>
          </div>

          <div>
            <label htmlFor="setting-mode" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Raspberry Pi Processing Mode
            </label>
            <select
              id="setting-mode"
              value={settings.processing_mode || 'pi_plus_cloud_ai'}
              onChange={(e) => updateField('processing_mode', e.target.value)}
              className="w-full min-h-[40px] rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="lightweight_pi">1. Lightweight Raspberry Pi Only (Offline Deterministic)</option>
              <option value="pi_plus_cloud_ai">2. Raspberry Pi + External AI API (Gemini Server Proxy)</option>
              <option value="pi_plus_local_ollama">3. Raspberry Pi + Separate Local AI Machine (Ollama LAN)</option>
            </select>
          </div>

          <div>
            <label htmlFor="setting-retention" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Audio Retention & Privacy Policy
            </label>
            <select
              id="setting-retention"
              value={settings.audio_retention_policy || 'delete_after_transcription'}
              onChange={(e) => updateField('audio_retention_policy', e.target.value)}
              className="w-full min-h-[40px] rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="delete_after_transcription">Delete Raw Audio Immediately After Transcription</option>
              <option value="retain_24_hours">Retain Encrypted WAV Segments for 24 Hours</option>
              <option value="retain_7_days">Retain Encrypted WAV Segments for 7 Days</option>
            </select>
          </div>

          <div>
            <label htmlFor="setting-schedule-start" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Active Recording Schedule Window
            </label>
            <div className="flex items-center gap-2">
              <input
                id="setting-schedule-start"
                type="time"
                value={settings.recording_schedule_start || '07:00'}
                onChange={(e) => updateField('recording_schedule_start', e.target.value)}
                className="flex-1 min-h-[40px] rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-xs font-mono"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                aria-label="Recording schedule end time"
                type="time"
                value={settings.recording_schedule_end || '22:30'}
                onChange={(e) => updateField('recording_schedule_end', e.target.value)}
                className="flex-1 min-h-[40px] rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label htmlFor="setting-diarization" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Voice Separation & Other Voice Prediction
            </label>
            <select
              id="setting-diarization"
              value={settings.speaker_diarization_enabled || 'true'}
              onChange={(e) => updateField('speaker_diarization_enabled', e.target.value)}
              className="w-full min-h-[40px] rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="true">Enabled — Separate My Voice & Predict Other Voices</option>
              <option value="primary_only">Strict Owner Mode — Ignore Non-Primary Voiceprints</option>
            </select>
          </div>
        </div>
      </form>

      {/* 3. Raspberry Pi Deployment, Backup & System Events */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-500" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Raspberry Pi ARM64 Quick Deployment & Auto-Recovery
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Run on Raspberry Pi OS (64-bit) to configure ALSA USB audio, SQLite WAL storage, and systemd boot service:
          </p>
          <pre className="p-3.5 rounded-xl bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto leading-relaxed border border-slate-800">
{`git clone https://local-pi.lan/voxpi-speech-intelligence.git
cd voxpi-speech-intelligence
chmod +x deployment/scripts/install_raspberry_pi.sh
./deployment/scripts/install_raspberry_pi.sh

# Or deploy via Docker Compose with /dev/snd USB Mic pass-through:
docker compose up -d --build`}
          </pre>
          <div className="pt-2 flex flex-wrap items-center gap-3">
            <a
              href="/api/data/export"
              download="voxpi-speech-intelligence-backup.json"
              className="min-h-[38px] px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-medium inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Full SQLite JSON Backup</span>
            </a>
          </div>
        </div>

        <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Recent Recording & Hardware Events
          </h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {events.map((ev) => (
              <div key={ev.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                <div>
                  <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                    {ev.event_type}
                  </span>
                  <p className="text-slate-600 dark:text-slate-300 mt-0.5">{ev.details}</p>
                </div>
                <span className="font-mono tabular-nums text-slate-400 shrink-0">
                  {ev.created_at.slice(11, 19)} UTC
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
