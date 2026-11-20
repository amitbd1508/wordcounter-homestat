import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import {
  analyzeSpeechSegment,
  AcousticFeatures,
  DEFAULT_VOICE_PROFILES,
} from '../utils/speechEngine';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'speech_intelligence.db');
export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS speech_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      total_words INTEGER NOT NULL DEFAULT 0,
      primary_user_words INTEGER NOT NULL DEFAULT 0,
      other_speaker_words INTEGER NOT NULL DEFAULT 0,
      avg_wpm INTEGER NOT NULL DEFAULT 0,
      unique_words INTEGER NOT NULL DEFAULT 0,
      filler_count INTEGER NOT NULL DEFAULT 0,
      primary_topic TEXT NOT NULL DEFAULT 'General Reflection',
      speaker_count INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'completed'
    );

    CREATE TABLE IF NOT EXISTS audio_segments (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      audio_retained INTEGER NOT NULL DEFAULT 0,
      vad_confidence REAL NOT NULL DEFAULT 0.94,
      microphone_device TEXT NOT NULL DEFAULT 'ReSpeaker 4-Mic Array (USB)',
      speaker_id TEXT NOT NULL DEFAULT 'spk_primary_owner',
      speaker_label TEXT NOT NULL DEFAULT 'My Voice (Primary User)',
      is_primary_user INTEGER NOT NULL DEFAULT 1,
      predicted_role TEXT NOT NULL DEFAULT 'Owner / Device Host',
      speaker_confidence REAL NOT NULL DEFAULT 0.95,
      pitch_hz INTEGER NOT NULL DEFAULT 132,
      vocal_range TEXT NOT NULL DEFAULT 'mid_tenor',
      FOREIGN KEY (session_id) REFERENCES speech_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transcripts (
      id TEXT PRIMARY KEY,
      segment_id TEXT NOT NULL UNIQUE,
      session_id TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      recognized_text TEXT NOT NULL,
      word_count INTEGER NOT NULL,
      wpm INTEGER NOT NULL,
      confidence_score REAL NOT NULL DEFAULT 0.95,
      processing_status TEXT NOT NULL DEFAULT 'processed',
      detected_topic TEXT NOT NULL,
      filler_count INTEGER NOT NULL DEFAULT 0,
      filler_percentage REAL NOT NULL DEFAULT 0,
      speaker_id TEXT NOT NULL DEFAULT 'spk_primary_owner',
      speaker_label TEXT NOT NULL DEFAULT 'My Voice (Primary User)',
      is_primary_user INTEGER NOT NULL DEFAULT 1,
      predicted_role TEXT NOT NULL DEFAULT 'Owner / Device Host',
      speaker_confidence REAL NOT NULL DEFAULT 0.95,
      pitch_hz INTEGER NOT NULL DEFAULT 132,
      FOREIGN KEY (segment_id) REFERENCES audio_segments(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES speech_sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_transcripts_start_time ON transcripts(start_time);
    CREATE INDEX IF NOT EXISTS idx_transcripts_topic ON transcripts(detected_topic);
    CREATE INDEX IF NOT EXISTS idx_transcripts_speaker ON transcripts(speaker_id);

    CREATE TABLE IF NOT EXISTS words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transcript_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      word TEXT NOT NULL,
      normalized_word TEXT NOT NULL,
      word_index INTEGER NOT NULL,
      is_filler INTEGER NOT NULL DEFAULT 0,
      filler_category TEXT,
      spoken_at TEXT NOT NULL,
      speaker_id TEXT NOT NULL DEFAULT 'spk_primary_owner',
      is_primary_user INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (transcript_id) REFERENCES transcripts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_words_normalized ON words(normalized_word);
    CREATE INDEX IF NOT EXISTS idx_words_spoken_at ON words(spoken_at);

    CREATE TABLE IF NOT EXISTS word_statistics (
      normalized_word TEXT PRIMARY KEY,
      total_count INTEGER NOT NULL DEFAULT 0,
      primary_user_count INTEGER NOT NULL DEFAULT 0,
      other_speaker_count INTEGER NOT NULL DEFAULT 0,
      first_spoken_at TEXT NOT NULL,
      last_spoken_at TEXT NOT NULL,
      is_filler INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS hourly_statistics (
      date_hour TEXT PRIMARY KEY, -- YYYY-MM-DDTHH
      date_str TEXT NOT NULL,     -- YYYY-MM-DD
      hour_num INTEGER NOT NULL,  -- 0..23
      word_count INTEGER NOT NULL DEFAULT 0,
      primary_user_words INTEGER NOT NULL DEFAULT 0,
      other_speaker_words INTEGER NOT NULL DEFAULT 0,
      speaking_duration_seconds INTEGER NOT NULL DEFAULT 0,
      avg_wpm INTEGER NOT NULL DEFAULT 0,
      filler_count INTEGER NOT NULL DEFAULT 0,
      top_topic TEXT NOT NULL DEFAULT 'General Reflection'
    );

    CREATE INDEX IF NOT EXISTS idx_hourly_date ON hourly_statistics(date_str);

    CREATE TABLE IF NOT EXISTS daily_statistics (
      date_str TEXT PRIMARY KEY, -- YYYY-MM-DD
      total_words INTEGER NOT NULL DEFAULT 0,
      primary_user_words INTEGER NOT NULL DEFAULT 0,
      other_speaker_words INTEGER NOT NULL DEFAULT 0,
      speaking_duration_seconds INTEGER NOT NULL DEFAULT 0,
      session_count INTEGER NOT NULL DEFAULT 0,
      unique_vocabulary INTEGER NOT NULL DEFAULT 0,
      avg_wpm INTEGER NOT NULL DEFAULT 0,
      filler_count INTEGER NOT NULL DEFAULT 0,
      filler_percentage REAL NOT NULL DEFAULT 0,
      top_topic TEXT NOT NULL DEFAULT 'General Reflection'
    );

    CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL DEFAULT 'Core',
      is_custom INTEGER NOT NULL DEFAULT 0,
      total_words INTEGER NOT NULL DEFAULT 0,
      segment_count INTEGER NOT NULL DEFAULT 0,
      color_hex TEXT NOT NULL DEFAULT '#6366F1'
    );

    CREATE TABLE IF NOT EXISTS topic_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_name TEXT NOT NULL,
      transcript_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      date_str TEXT NOT NULL,
      word_count INTEGER NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.92,
      FOREIGN KEY (transcript_id) REFERENCES transcripts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_summaries (
      date_str TEXT PRIMARY KEY,
      overview TEXT NOT NULL,
      main_topics_json TEXT NOT NULL,
      important_discussions_json TEXT NOT NULL,
      decisions_json TEXT NOT NULL,
      commitments_json TEXT NOT NULL,
      questions_json TEXT NOT NULL,
      recurring_themes_json TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      provider_used TEXT NOT NULL DEFAULT 'Local Rules + Gemini Hybrid'
    );

    CREATE TABLE IF NOT EXISTS vocabulary_statistics (
      date_str TEXT PRIMARY KEY,
      unique_words_count INTEGER NOT NULL DEFAULT 0,
      new_words_count INTEGER NOT NULL DEFAULT 0,
      diversity_score INTEGER NOT NULL DEFAULT 0,
      top_words_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS filler_word_statistics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transcript_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      date_str TEXT NOT NULL,
      filler_phrase TEXT NOT NULL,
      category TEXT NOT NULL,
      position TEXT NOT NULL,
      trigger_context TEXT NOT NULL,
      snippet TEXT NOT NULL,
      speaker_id TEXT NOT NULL DEFAULT 'spk_primary_owner',
      is_primary_user INTEGER NOT NULL DEFAULT 1,
      spoken_at TEXT NOT NULL,
      FOREIGN KEY (transcript_id) REFERENCES transcripts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_filler_date ON filler_word_statistics(date_str);
    CREATE INDEX IF NOT EXISTS idx_filler_phrase ON filler_word_statistics(filler_phrase);

    CREATE TABLE IF NOT EXISTS user_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recording_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_conversations (
      id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      citations_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS data_exports (
      id TEXT PRIMARY KEY,
      export_format TEXT NOT NULL,
      record_count INTEGER NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_health (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      pi_model TEXT NOT NULL,
      os_version TEXT NOT NULL,
      cpu_usage_percent REAL NOT NULL,
      ram_used_mb INTEGER NOT NULL,
      ram_total_mb INTEGER NOT NULL,
      storage_used_gb REAL NOT NULL,
      storage_total_gb REAL NOT NULL,
      cpu_temp_celsius REAL NOT NULL,
      microphone_status TEXT NOT NULL,
      microphone_device TEXT NOT NULL,
      vad_engine TEXT NOT NULL,
      stt_model TEXT NOT NULL,
      recording_state TEXT NOT NULL,
      uptime_seconds INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  seedDefaultSettingsAndData();
}

function getDateStrOffset(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function getIsoTimestamp(daysAgo: number, hour: number, minute: number, second = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, minute, second, 0);
  return d.toISOString();
}

export function ingestSpeechSegment(params: {
  sessionId?: string;
  sessionTitle?: string;
  text: string;
  startTimeIso: string;
  durationSeconds: number;
  acoustics?: AcousticFeatures;
  speakerOverride?: {
    speakerId: string;
    speakerLabel: string;
    isPrimaryUser: boolean;
    predictedRole: string;
    confidence: number;
    pitchHz: number;
    vocalRange: string;
  };
  microphoneDevice?: string;
}) {
  const analysis = analyzeSpeechSegment(params.text, params.durationSeconds, params.acoustics);
  if (analysis.totalWords === 0) {
    return null;
  }

  const spk = params.speakerOverride || {
    speakerId: analysis.speakerPrediction?.speakerId || 'spk_primary_owner',
    speakerLabel: analysis.speakerPrediction?.speakerLabel || 'My Voice (Primary User)',
    isPrimaryUser: analysis.speakerPrediction ? analysis.speakerPrediction.isPrimaryUser : true,
    predictedRole: analysis.speakerPrediction?.predictedRole || 'Owner / Device Host',
    confidence: analysis.speakerPrediction?.confidence || 0.96,
    pitchHz: analysis.speakerPrediction?.vocalCharacteristics.pitchHz || 132,
    vocalRange: analysis.speakerPrediction?.vocalCharacteristics.vocalRange || 'mid_tenor',
  };

  const startMs = new Date(params.startTimeIso).getTime();
  const endIso = new Date(startMs + analysis.durationSeconds * 1000).toISOString();
  const dateStr = params.startTimeIso.slice(0, 10);
  const hourNum = new Date(params.startTimeIso).getUTCHours();
  const dateHour = `${dateStr}T${String(hourNum).padStart(2, '0')}`;

  const sessionId = params.sessionId || `sess_${dateStr}_${String(hourNum).padStart(2, '0')}`;
  const segmentId = `seg_${startMs}_${Math.random().toString(36).slice(2, 7)}`;
  const transcriptId = `tr_${startMs}_${Math.random().toString(36).slice(2, 7)}`;

  const tx = db.transaction(() => {
    // 1. Upsert speech_sessions
    const existingSession = db
      .prepare('SELECT * FROM speech_sessions WHERE id = ?')
      .get(sessionId) as any;

    const myWordsDelta = spk.isPrimaryUser ? analysis.totalWords : 0;
    const otherWordsDelta = spk.isPrimaryUser ? 0 : analysis.totalWords;

    if (!existingSession) {
      db.prepare(`
        INSERT INTO speech_sessions (
          id, title, start_time, end_time, duration_seconds, total_words,
          primary_user_words, other_speaker_words, avg_wpm, unique_words,
          filler_count, primary_topic, speaker_count, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
      `).run(
        sessionId,
        params.sessionTitle || `${analysis.detectedTopic} Session`,
        params.startTimeIso,
        endIso,
        analysis.durationSeconds,
        analysis.totalWords,
        myWordsDelta,
        otherWordsDelta,
        analysis.wpm,
        analysis.uniqueWordCount,
        analysis.totalFillerCount,
        analysis.detectedTopic,
        spk.isPrimaryUser ? 1 : 2
      );
    } else {
      const newDuration = existingSession.duration_seconds + analysis.durationSeconds;
      const newWords = existingSession.total_words + analysis.totalWords;
      const newMyWords = existingSession.primary_user_words + myWordsDelta;
      const newOtherWords = existingSession.other_speaker_words + otherWordsDelta;
      const newWpm = newDuration > 0 ? Math.round((newWords / newDuration) * 60) : existingSession.avg_wpm;
      const newFillers = existingSession.filler_count + analysis.totalFillerCount;
      const newSpeakers = newOtherWords > 0 && newMyWords > 0 ? 2 : 1;

      db.prepare(`
        UPDATE speech_sessions
        SET end_time = ?, duration_seconds = ?, total_words = ?,
            primary_user_words = ?, other_speaker_words = ?, avg_wpm = ?,
            unique_words = unique_words + ?, filler_count = ?, speaker_count = ?
        WHERE id = ?
      `).run(
        endIso,
        newDuration,
        newWords,
        newMyWords,
        newOtherWords,
        newWpm,
        Math.max(1, Math.round(analysis.uniqueWordCount * 0.6)),
        newFillers,
        newSpeakers,
        sessionId
      );
    }

    // 2. Insert audio_segments
    db.prepare(`
      INSERT INTO audio_segments (
        id, session_id, start_time, end_time, duration_seconds, audio_retained,
        vad_confidence, microphone_device, speaker_id, speaker_label,
        is_primary_user, predicted_role, speaker_confidence, pitch_hz, vocal_range
      ) VALUES (?, ?, ?, ?, ?, 0, 0.96, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      segmentId,
      sessionId,
      params.startTimeIso,
      endIso,
      analysis.durationSeconds,
      params.microphoneDevice || 'ReSpeaker 4-Mic Array (USB)',
      spk.speakerId,
      spk.speakerLabel,
      spk.isPrimaryUser ? 1 : 0,
      spk.predictedRole,
      spk.confidence,
      spk.pitchHz,
      spk.vocalRange
    );

    // 3. Insert transcripts
    db.prepare(`
      INSERT INTO transcripts (
        id, segment_id, session_id, start_time, end_time, recognized_text,
        word_count, wpm, confidence_score, processing_status, detected_topic,
        filler_count, filler_percentage, speaker_id, speaker_label,
        is_primary_user, predicted_role, speaker_confidence, pitch_hz
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.96, 'processed', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      transcriptId,
      segmentId,
      sessionId,
      params.startTimeIso,
      endIso,
      analysis.cleanText,
      analysis.totalWords,
      analysis.wpm,
      analysis.detectedTopic,
      analysis.totalFillerCount,
      analysis.fillerPercentage,
      spk.speakerId,
      spk.speakerLabel,
      spk.isPrimaryUser ? 1 : 0,
      spk.predictedRole,
      spk.confidence,
      spk.pitchHz
    );

    // 4. Insert words and update word_statistics
    const insertWordStmt = db.prepare(`
      INSERT INTO words (
        transcript_id, session_id, word, normalized_word, word_index,
        is_filler, filler_category, spoken_at, speaker_id, is_primary_user
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const upsertWordStatStmt = db.prepare(`
      INSERT INTO word_statistics (
        normalized_word, total_count, primary_user_count, other_speaker_count,
        first_spoken_at, last_spoken_at, is_filler
      ) VALUES (?, 1, ?, ?, ?, ?, ?)
      ON CONFLICT(normalized_word) DO UPDATE SET
        total_count = total_count + 1,
        primary_user_count = primary_user_count + excluded.primary_user_count,
        other_speaker_count = other_speaker_count + excluded.other_speaker_count,
        last_spoken_at = excluded.last_spoken_at
    `);

    for (const token of analysis.tokens) {
      const tokenSpokenIso = new Date(startMs + token.startOffsetMs).toISOString();
      insertWordStmt.run(
        transcriptId,
        sessionId,
        token.word,
        token.normalized,
        token.index,
        token.isFiller ? 1 : 0,
        token.fillerCategory || null,
        tokenSpokenIso,
        spk.speakerId,
        spk.isPrimaryUser ? 1 : 0
      );

      upsertWordStatStmt.run(
        token.normalized,
        spk.isPrimaryUser ? 1 : 0,
        spk.isPrimaryUser ? 0 : 1,
        tokenSpokenIso,
        tokenSpokenIso,
        token.isFiller ? 1 : 0
      );
    }

    // 5. Insert filler_word_statistics
    const insertFillerStmt = db.prepare(`
      INSERT INTO filler_word_statistics (
        transcript_id, session_id, date_str, filler_phrase, category,
        position, trigger_context, snippet, speaker_id, is_primary_user, spoken_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const occ of analysis.fillerOccurrences) {
      insertFillerStmt.run(
        transcriptId,
        sessionId,
        dateStr,
        occ.fillerPhrase,
        occ.category,
        occ.position,
        occ.triggerContext,
        occ.snippet,
        spk.speakerId,
        spk.isPrimaryUser ? 1 : 0,
        params.startTimeIso
      );
    }

    // 6. Update topics and topic_segments
    const TOPIC_COLORS: Record<string, string> = {
      'Software Engineering': '#6366F1',
      'Technology & IoT': '#0EA5E9',
      'Work & Strategy': '#10B981',
      'Finance': '#F59E0B',
      'Health & Fitness': '#EC4899',
      'Learning & Research': '#8B5CF6',
      'Personal Life & Family': '#14B8A6',
      'Travel': '#F97316',
      'General Reflection': '#64748B',
    };

    const topicId = `top_${analysis.detectedTopic.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    db.prepare(`
      INSERT INTO topics (id, name, category, is_custom, total_words, segment_count, color_hex)
      VALUES (?, ?, 'Core', 0, ?, 1, ?)
      ON CONFLICT(name) DO UPDATE SET
        total_words = total_words + excluded.total_words,
        segment_count = segment_count + 1
    `).run(
      topicId,
      analysis.detectedTopic,
      analysis.totalWords,
      TOPIC_COLORS[analysis.detectedTopic] || '#6366F1'
    );

    db.prepare(`
      INSERT INTO topic_segments (topic_name, transcript_id, session_id, date_str, word_count, confidence)
      VALUES (?, ?, ?, ?, ?, 0.94)
    `).run(analysis.detectedTopic, transcriptId, sessionId, dateStr, analysis.totalWords);

    // 7. Update hourly_statistics
    const existingHour = db
      .prepare('SELECT * FROM hourly_statistics WHERE date_hour = ?')
      .get(dateHour) as any;

    if (!existingHour) {
      db.prepare(`
        INSERT INTO hourly_statistics (
          date_hour, date_str, hour_num, word_count, primary_user_words,
          other_speaker_words, speaking_duration_seconds, avg_wpm, filler_count, top_topic
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        dateHour,
        dateStr,
        hourNum,
        analysis.totalWords,
        myWordsDelta,
        otherWordsDelta,
        analysis.durationSeconds,
        analysis.wpm,
        analysis.totalFillerCount,
        analysis.detectedTopic
      );
    } else {
      const hWords = existingHour.word_count + analysis.totalWords;
      const hDur = existingHour.speaking_duration_seconds + analysis.durationSeconds;
      const hWpm = hDur > 0 ? Math.round((hWords / hDur) * 60) : existingHour.avg_wpm;
      db.prepare(`
        UPDATE hourly_statistics
        SET word_count = ?, primary_user_words = primary_user_words + ?,
            other_speaker_words = other_speaker_words + ?,
            speaking_duration_seconds = ?, avg_wpm = ?,
            filler_count = filler_count + ?, top_topic = ?
        WHERE date_hour = ?
      `).run(
        hWords,
        myWordsDelta,
        otherWordsDelta,
        hDur,
        hWpm,
        analysis.totalFillerCount,
        analysis.detectedTopic,
        dateHour
      );
    }

    // 8. Recalculate daily_statistics for dateStr accurately
    recalculateDailyStatistics(dateStr);
  });

  tx();

  return {
    transcriptId,
    segmentId,
    sessionId,
    analysis,
    speaker: spk,
  };
}

export function recalculateDailyStatistics(dateStr: string) {
  const agg = db.prepare(`
    SELECT
      COALESCE(SUM(word_count), 0) as total_words,
      COALESCE(SUM(CASE WHEN is_primary_user = 1 THEN word_count ELSE 0 END), 0) as primary_user_words,
      COALESCE(SUM(CASE WHEN is_primary_user = 0 THEN word_count ELSE 0 END), 0) as other_speaker_words,
      COALESCE(SUM(filler_count), 0) as filler_count,
      COUNT(DISTINCT session_id) as session_count
    FROM transcripts
    WHERE substr(start_time, 1, 10) = ?
  `).get(dateStr) as any;

  const durRow = db.prepare(`
    SELECT COALESCE(SUM(duration_seconds), 0) as total_duration
    FROM audio_segments
    WHERE substr(start_time, 1, 10) = ?
  `).get(dateStr) as any;

  const uniqueRow = db.prepare(`
    SELECT COUNT(DISTINCT normalized_word) as unique_vocab
    FROM words
    WHERE substr(spoken_at, 1, 10) = ?
  `).get(dateStr) as any;

  const topTopicRow = db.prepare(`
    SELECT detected_topic, SUM(word_count) as w
    FROM transcripts
    WHERE substr(start_time, 1, 10) = ?
    GROUP BY detected_topic
    ORDER BY w DESC
    LIMIT 1
  `).get(dateStr) as any;

  const totalWords = agg.total_words || 0;
  const totalDuration = durRow.total_duration || 0;
  const avgWpm = totalDuration > 0 ? Math.round((totalWords / totalDuration) * 60) : 0;
  const fillerCount = agg.filler_count || 0;
  const fillerPct = totalWords > 0 ? Number(((fillerCount / totalWords) * 100).toFixed(2)) : 0;
  const topTopic = topTopicRow ? topTopicRow.detected_topic : 'General Reflection';

  db.prepare(`
    INSERT INTO daily_statistics (
      date_str, total_words, primary_user_words, other_speaker_words,
      speaking_duration_seconds, session_count, unique_vocabulary,
      avg_wpm, filler_count, filler_percentage, top_topic
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date_str) DO UPDATE SET
      total_words = excluded.total_words,
      primary_user_words = excluded.primary_user_words,
      other_speaker_words = excluded.other_speaker_words,
      speaking_duration_seconds = excluded.speaking_duration_seconds,
      session_count = excluded.session_count,
      unique_vocabulary = excluded.unique_vocabulary,
      avg_wpm = excluded.avg_wpm,
      filler_count = excluded.filler_count,
      filler_percentage = excluded.filler_percentage,
      top_topic = excluded.top_topic
  `).run(
    dateStr,
    totalWords,
    agg.primary_user_words || 0,
    agg.other_speaker_words || 0,
    totalDuration,
    agg.session_count || 0,
    uniqueRow.unique_vocab || 0,
    avgWpm,
    fillerCount,
    fillerPct,
    topTopic
  );

  // Also update vocabulary_statistics
  const topWords = db.prepare(`
    SELECT normalized_word as word, COUNT(*) as count
    FROM words
    WHERE substr(spoken_at, 1, 10) = ? AND is_filler = 0 AND length(normalized_word) > 3
    GROUP BY normalized_word
    ORDER BY count DESC
    LIMIT 10
  `).all(dateStr);

  const diversity = totalWords > 0 ? Math.min(100, Math.round(((uniqueRow.unique_vocab || 0) / totalWords) * 100)) : 0;

  db.prepare(`
    INSERT INTO vocabulary_statistics (
      date_str, unique_words_count, new_words_count, diversity_score, top_words_json
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(date_str) DO UPDATE SET
      unique_words_count = excluded.unique_words_count,
      diversity_score = excluded.diversity_score,
      top_words_json = excluded.top_words_json
  `).run(
    dateStr,
    uniqueRow.unique_vocab || 0,
    Math.max(3, Math.round((uniqueRow.unique_vocab || 0) * 0.14)),
    diversity,
    JSON.stringify(topWords)
  );
}

function seedDefaultSettingsAndData() {
  const existingCount = (db.prepare('SELECT COUNT(*) as c FROM transcripts').get() as any).c;
  if (existingCount > 0) {
    return;
  }

  // 1. Default settings
  const defaultSettings: Record<string, string> = {
    microphone_device: 'ReSpeaker 4-Mic Array (USB Audio)',
    recording_enabled: 'true',
    recording_schedule_start: '07:00',
    recording_schedule_end: '22:30',
    language: 'en-US',
    stt_model: 'faster-whisper-small.en (INT8 ARM64)',
    vad_engine: 'Silero VAD v5 (0.52 threshold)',
    ai_provider: 'gemini',
    ai_model: 'gemini-4-hydrogen',
    processing_mode: 'pi_plus_cloud_ai', // lightweight_pi | pi_plus_cloud_ai | pi_plus_local_ollama
    ollama_endpoint: 'http://192.168.1.50:11434',
    audio_retention_policy: 'delete_after_transcription',
    data_retention_days: '365',
    timezone: 'America/Los_Angeles',
    theme: 'dark',
    speaker_diarization_enabled: 'true',
    auto_filter_other_voices: 'false',
    consent_notice_enabled: 'true',
    remote_access_mode: 'WireGuard / Tailscale Mesh VPN (Local Subnet Only)',
    password_protected: 'true',
  };

  const insertSetting = db.prepare('INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaultSettings)) {
    insertSetting.run(k, v);
  }

  // 2. System Health row
  db.prepare(`
    INSERT OR REPLACE INTO system_health (
      id, pi_model, os_version, cpu_usage_percent, ram_used_mb, ram_total_mb,
      storage_used_gb, storage_total_gb, cpu_temp_celsius, microphone_status,
      microphone_device, vad_engine, stt_model, recording_state, uptime_seconds, updated_at
    ) VALUES (
      1, 'Raspberry Pi 5 Model B Rev 1.0 (8GB ARM64)', 'Debian GNU/Linux 12 (bookworm) aarch64',
      24.6, 1840, 8192, 18.4, 128.0, 48.2, 'connected',
      'ReSpeaker 4-Mic Array (USB Audio)', 'Silero VAD v5', 'faster-whisper-small.en (INT8)',
      'active', 349210, ?
    )
  `).run(new Date().toISOString());

  // 3. Seed realistic multi-day transcripts across the past 7 days including Today (0 days ago)
  // Includes both Primary User ("My Voice") and Other Predicted Voices ("Voice B - Tech Colleague", "Voice C - Family / Partner")
  const seedSegments = [
    // Today (0 days ago)
    {
      daysAgo: 0,
      hour: 8,
      minute: 15,
      duration: 28,
      sessionTitle: 'Morning Architecture & Pi Telemetry Check',
      acoustics: { pitchHz: 131, energyRms: 0.52, spectralCentroidHz: 1640 },
      text: 'Good morning. Let us review the Raspberry Pi five speech intelligence node status. Um, the Silero VAD voice activity detection service ran overnight with zero dropped frames, and we decided to keep the SQLite WAL journal mode active so concurrent reads from the mobile PWA stay under five milliseconds.',
    },
    {
      daysAgo: 0,
      hour: 9,
      minute: 30,
      duration: 34,
      sessionTitle: 'Backend API & Database Sync with Colleague',
      acoustics: { pitchHz: 134, energyRms: 0.54, spectralCentroidHz: 1670 },
      text: 'During the architecture review today, I mean, we basically finalized the seventeen SQLite database tables for word counting and filler word tracking. I need to deploy the updated systemd unit file before our afternoon milestone check. How should we partition the hourly statistics index for multi-year retention?',
    },
    {
      daysAgo: 0,
      hour: 9,
      minute: 32,
      duration: 24,
      sessionTitle: 'Backend API & Database Sync with Colleague',
      acoustics: { pitchHz: 179, energyRms: 0.49, spectralCentroidHz: 2110 }, // Matches Voice B (Tech Colleague)
      text: 'From my side on the API pull request, uh, the composite index on start_time and detected_topic handles the daily aggregation query in under two milliseconds. You know, we can also trigger an automatic encrypted backup to the external NVMe volume every midnight.',
    },
    {
      daysAgo: 0,
      hour: 11,
      minute: 20,
      duration: 26,
      sessionTitle: 'Personal Voice Analytics & Filler Reduction Note',
      acoustics: { pitchHz: 130, energyRms: 0.48, spectralCentroidHz: 1630 },
      text: 'I noticed that when I explain complex software engineering migrations without notes, um, I sort of use qualifiers like basically and actually during clause transitions. I will practice pausing silently for half a second instead of filling the gap with hesitation sounds.',
    },
    {
      daysAgo: 0,
      hour: 12,
      minute: 45,
      duration: 20,
      sessionTitle: 'Lunch & Weekend Family Planning',
      acoustics: { pitchHz: 225, energyRms: 0.45, spectralCentroidHz: 2440 }, // Matches Voice C (Family / Partner)
      text: 'Hey, what time are we planning dinner with the family this weekend? Should we pick up groceries after your afternoon workout?',
    },
    {
      daysAgo: 0,
      hour: 12,
      minute: 46,
      duration: 22,
      sessionTitle: 'Lunch & Weekend Family Planning',
      acoustics: { pitchHz: 132, energyRms: 0.47, spectralCentroidHz: 1650 },
      text: 'We agreed on seven PM on Saturday at home. I will finish my five kilometer cardio run at five thirty and pick up the fresh produce on the way back.',
    },
    {
      daysAgo: 0,
      hour: 14,
      minute: 10,
      duration: 30,
      sessionTitle: 'AI Provider & Edge Privacy Review',
      acoustics: { pitchHz: 133, energyRms: 0.51, spectralCentroidHz: 1660 },
      text: 'For privacy compliance, we decided to delete raw PCM audio chunks immediately after faster-whisper finishes word timestamp extraction. Only the structured transcript, acoustic pitch metadata, and speaker separation embeddings remain on the local SQLite disk.',
    },

    // Yesterday (1 day ago)
    {
      daysAgo: 1,
      hour: 9,
      minute: 10,
      duration: 32,
      sessionTitle: 'Sprint Planning & Cloud Cost Audit',
      acoustics: { pitchHz: 131, energyRms: 0.5, spectralCentroidHz: 1645 },
      text: 'Looking at our quarterly infrastructure budget, um, running speech-to-text locally on the Raspberry Pi saves significant cloud API expenses. We chose to keep word counting and topic detection completely independent of paid external APIs.',
    },
    {
      daysAgo: 1,
      hour: 15,
      minute: 0,
      duration: 35,
      sessionTitle: 'Deep Work: Real-Time WebSocket Streaming',
      acoustics: { pitchHz: 133, energyRms: 0.53, spectralCentroidHz: 1665 },
      text: 'The mobile dashboard WebSocket client needs to append partial and finalized words smoothly as they arrive from the backend transcription worker. Uh, you know, we also added an active waveform badge so the user always knows when the USB microphone is listening or paused.',
    },
    {
      daysAgo: 1,
      hour: 15,
      minute: 2,
      duration: 25,
      sessionTitle: 'Deep Work: Real-Time WebSocket Streaming',
      acoustics: { pitchHz: 181, energyRms: 0.48, spectralCentroidHz: 2090 },
      text: 'That real-time streaming feed looks super responsive on iOS Safari. Let us make sure the speaker separation badge clearly distinguishes primary user speech from other voices in the room.',
    },

    // 2 days ago
    {
      daysAgo: 2,
      hour: 10,
      minute: 30,
      duration: 36,
      sessionTitle: 'Researching Neural Diarization & Embeddings',
      acoustics: { pitchHz: 132, energyRms: 0.5, spectralCentroidHz: 1650 },
      text: 'I spent the morning reading documentation on acoustic voiceprint embeddings and pitch fundamental frequency analysis. Basically, by combining fundamental pitch in hertz with spectral centroid features, we can separate my voice from other speakers and predict their conversational role.',
    },
    {
      daysAgo: 2,
      hour: 18,
      minute: 15,
      duration: 25,
      sessionTitle: 'Evening Fitness & Recovery Log',
      acoustics: { pitchHz: 129, energyRms: 0.46, spectralCentroidHz: 1620 },
      text: 'Completed a forty-five minute strength workout and stretching session. Sleep quality improved this week and morning energy levels feel much steadier.',
    },

    // 3 days ago
    {
      daysAgo: 3,
      hour: 11,
      minute: 0,
      duration: 30,
      sessionTitle: 'Product Roadmap & Client Deliverable Sync',
      acoustics: { pitchHz: 132, energyRms: 0.52, spectralCentroidHz: 1655 },
      text: 'We finalized the Q4 product roadmap with the engineering team. I need to send the updated milestone schedule to the stakeholder group by Thursday morning.',
    },
    {
      daysAgo: 3,
      hour: 11,
      minute: 2,
      duration: 22,
      sessionTitle: 'Product Roadmap & Client Deliverable Sync',
      acoustics: { pitchHz: 109, energyRms: 0.51, spectralCentroidHz: 1390 }, // Voice D (Remote Caller)
      text: 'Thanks for walking through the deployment timeline. Can we include the offline PWA verification report in the release package?',
    },

    // 4 days ago
    {
      daysAgo: 4,
      hour: 14,
      minute: 20,
      duration: 29,
      sessionTitle: 'Database Migration & Backup Verification',
      acoustics: { pitchHz: 131, energyRms: 0.49, spectralCentroidHz: 1640 },
      text: 'Tested the Alembic and SQLite automated backup restore script on the Raspberry Pi. Um, the integrity check passed with zero corrupted pages and full foreign key enforcement.',
    },

    // 5 days ago
    {
      daysAgo: 5,
      hour: 16,
      minute: 45,
      duration: 27,
      sessionTitle: 'Travel Itinerary & Conference Prep',
      acoustics: { pitchHz: 132, energyRms: 0.5, spectralCentroidHz: 1650 },
      text: 'Booked the flight and hotel itinerary for the embedded systems conference next month. I need to prepare the hardware demo kit and USB microphone enclosure.',
    },

    // 6 days ago
    {
      daysAgo: 6,
      hour: 10,
      minute: 0,
      duration: 31,
      sessionTitle: 'Weekly Financial & Subscription Review',
      acoustics: { pitchHz: 133, energyRms: 0.48, spectralCentroidHz: 1655 },
      text: 'Reviewed monthly software subscriptions and cloud hosting invoices. Consolidating our self-hosted analytics onto the Raspberry Pi reduced recurring server expenses by forty percent.',
    },
  ];

  for (const item of seedSegments) {
    const startIso = getIsoTimestamp(item.daysAgo, item.hour, item.minute);
    const sessionKey = `sess_day${item.daysAgo}_${item.sessionTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24)}`;
    ingestSpeechSegment({
      sessionId: sessionKey,
      sessionTitle: item.sessionTitle,
      text: item.text,
      startTimeIso: startIso,
      durationSeconds: item.duration,
      acoustics: item.acoustics,
    });
  }

  // 4. Generate initial AI Summaries for Today and Yesterday
  const todayStr = getDateStrOffset(0);
  const yesterdayStr = getDateStrOffset(1);

  db.prepare(`
    INSERT OR REPLACE INTO ai_summaries (
      date_str, overview, main_topics_json, important_discussions_json,
      decisions_json, commitments_json, questions_json, recurring_themes_json,
      generated_at, provider_used
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    todayStr,
    'Focused heavily on Raspberry Pi 5 speech intelligence architecture, SQLite 17-table schema optimization, and privacy-first audio retention. Held a collaborative technical sync with an engineering colleague (Voice B) on index performance and coordinated weekend family dinner plans (Voice C).',
    JSON.stringify(['Software Engineering', 'Technology & IoT', 'Personal Life & Family']),
    JSON.stringify([
      'Verified Silero VAD overnight stability and SQLite WAL latency (<5ms) on Raspberry Pi 5.',
      'Reviewed composite index performance and midnight NVMe backup automation with Engineering Peer (Voice B).',
      'Analyzed personal filler word triggers during unscripted technical explanations.',
      'Coordinated Saturday 7:00 PM family dinner and post-workout grocery pickup with Household Member (Voice C).'
    ]),
    JSON.stringify([
      'Keep SQLite WAL journal mode active for sub-5ms mobile PWA reads.',
      'Finalized 17 SQLite database tables for word counting and contextual filler analysis.',
      'Delete raw PCM audio chunks immediately after faster-whisper timestamp extraction.',
      'Agreed on 7:00 PM Saturday for family dinner at home.'
    ]),
    JSON.stringify([
      'Deploy the updated systemd unit file before the afternoon milestone check.',
      'Practice pausing silently for 0.5s instead of using qualifiers ("basically", "actually") during transitions.',
      'Finish 5km cardio run at 5:30 PM Saturday and pick up fresh produce.'
    ]),
    JSON.stringify([
      'How should we partition the hourly statistics index for multi-year retention?',
      'What time are we planning dinner with the family this weekend?'
    ]),
    JSON.stringify([
      'Edge privacy & zero-retention audio processing',
      'Conscious reduction of mid-clause filler qualifiers',
      'Multi-speaker voice separation between owner and room guests'
    ]),
    new Date().toISOString(),
    'Local deterministic + Gemini Hybrid Engine'
  );

  db.prepare(`
    INSERT OR REPLACE INTO ai_summaries (
      date_str, overview, main_topics_json, important_discussions_json,
      decisions_json, commitments_json, questions_json, recurring_themes_json,
      generated_at, provider_used
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    yesterdayStr,
    'Audited quarterly cloud costs versus local Raspberry Pi inference and implemented the real-time WebSocket live transcription display with speaker separation badges.',
    JSON.stringify(['Finance', 'Software Engineering', 'Technology & IoT']),
    JSON.stringify([
      'Evaluated cost savings of local faster-whisper INT8 inference on ARM64.',
      'Designed real-time WebSocket word streaming and active microphone waveform status.',
      'Validated iOS Safari responsiveness with Engineering Peer (Voice B).'
    ]),
    JSON.stringify([
      'Keep core word counting and topic detection 100% independent of paid cloud APIs.'
    ]),
    JSON.stringify([
      'Ensure speaker separation badges clearly distinguish primary user speech from other voices.'
    ]),
    JSON.stringify([]),
    JSON.stringify(['Self-hosted cost efficiency', 'Real-time mobile transcription ergonomics']),
    new Date().toISOString(),
    'Local deterministic + Gemini Hybrid Engine'
  );

  // 5. Seed recording events
  const insertEvent = db.prepare('INSERT INTO recording_events (event_type, details, created_at) VALUES (?, ?, ?)');
  insertEvent.run('SYSTEM_BOOT', 'Raspberry Pi 5 systemd service (voxpi-daemon.service) started cleanly', getIsoTimestamp(0, 7, 0));
  insertEvent.run('MIC_CONNECTED', 'USB Audio: ReSpeaker 4-Mic Array enumerated on ALSA hw:1,0 (16kHz mono)', getIsoTimestamp(0, 7, 0, 5));
  insertEvent.run('SPEAKER_ENROLLED', 'Loaded primary voiceprint embedding (132Hz baritone-tenor anchor)', getIsoTimestamp(0, 7, 0, 12));
}

export { DEFAULT_VOICE_PROFILES };
