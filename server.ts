import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import {
  db,
  initDatabase,
  ingestSpeechSegment,
  recalculateDailyStatistics,
  DEFAULT_VOICE_PROFILES,
} from './src/server/db';
import {
  analyzeSpeechSegment,
  extractInsightsFromText,
} from './src/utils/speechEngine';

dotenv.config();

initDatabase();

const app = express();
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  if (request.url?.startsWith('/api/ws')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
});

// Active recording state on the server
let recordingState: 'active' | 'paused' | 'stopped' = 'active';
let simulationRunning = true;
let liveStreamWordIndex = 0;
let liveSentenceIndex = 0;

const SIMULATED_STREAM_UTTERANCES = [
  {
    speakerId: 'spk_primary_owner',
    speakerLabel: 'My Voice (Primary User)',
    isPrimaryUser: true,
    predictedRole: 'Owner / Device Host',
    acoustics: { pitchHz: 132, energyRms: 0.52, spectralCentroidHz: 1650 },
    text: 'I am checking the live transcription display on the mobile frontend right now, and um, each spoken word appends smoothly with its acoustic pitch profile.',
  },
  {
    speakerId: 'spk_guest_colleague',
    speakerLabel: 'Voice B (Predicted: Tech Colleague)',
    isPrimaryUser: false,
    predictedRole: 'Engineering Peer / Collaborator',
    acoustics: { pitchHz: 180, energyRms: 0.49, spectralCentroidHz: 2115 },
    text: 'The voice separation engine detected my higher spectral centroid and automatically separated my voice from your primary profile in real time.',
  },
  {
    speakerId: 'spk_primary_owner',
    speakerLabel: 'My Voice (Primary User)',
    isPrimaryUser: true,
    predictedRole: 'Owner / Device Host',
    acoustics: { pitchHz: 130, energyRms: 0.51, spectralCentroidHz: 1635 },
    text: 'We decided to track filler words like basically and you know per session so we can inspect the exact conversational context.',
  },
  {
    speakerId: 'spk_guest_partner',
    speakerLabel: 'Voice C (Predicted: Family / Partner)',
    isPrimaryUser: false,
    predictedRole: 'Household / Family Member',
    acoustics: { pitchHz: 224, energyRms: 0.45, spectralCentroidHz: 2435 },
    text: 'Remember to pause the Raspberry Pi microphone schedule during our family movie night later this evening.',
  },
];

function broadcastWs(payload: Record<string, unknown>) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

wss.on('connection', (ws) => {
  ws.send(
    JSON.stringify({
      type: 'status',
      recordingState,
      simulationRunning,
      timestamp: new Date().toISOString(),
    })
  );
});

// Background real-time word-by-word streamer when recordingState === 'active' and simulationRunning === true
let partialWordsBuffer: string[] = [];
setInterval(() => {
  if (recordingState !== 'active' || !simulationRunning) {
    return;
  }

  const currentUtterance = SIMULATED_STREAM_UTTERANCES[liveSentenceIndex % SIMULATED_STREAM_UTTERANCES.length];
  const words = currentUtterance.text.split(' ');

  if (liveStreamWordIndex < words.length) {
    const nextWord = words[liveStreamWordIndex];
    partialWordsBuffer.push(nextWord);
    liveStreamWordIndex++;

    const cleanNorm = nextWord.replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, '').toLowerCase();
    const isFiller = ['um', 'uh', 'like', 'basically', 'actually'].includes(cleanNorm);

    broadcastWs({
      type: 'partial_transcript',
      recordingState,
      word: nextWord,
      isFiller,
      partialText: partialWordsBuffer.join(' '),
      wordIndex: liveStreamWordIndex,
      totalWordsInUtterance: words.length,
      speaker: {
        speakerId: currentUtterance.speakerId,
        speakerLabel: currentUtterance.speakerLabel,
        isPrimaryUser: currentUtterance.isPrimaryUser,
        predictedRole: currentUtterance.predictedRole,
        pitchHz: currentUtterance.acoustics.pitchHz + (Math.floor(Math.random() * 5) - 2),
        confidence: 0.96,
      },
      timestamp: new Date().toISOString(),
    });
  } else {
    // Finalize segment and persist into SQLite
    const finalizedText = partialWordsBuffer.join(' ');
    const durationSec = Math.max(6, Math.round(words.length * 0.45));
    const nowIso = new Date().toISOString();

    const ingested = ingestSpeechSegment({
      sessionTitle: 'Live Real-Time Stream Session',
      text: finalizedText,
      startTimeIso: nowIso,
      durationSeconds: durationSec,
      acoustics: currentUtterance.acoustics,
    });

    partialWordsBuffer = [];
    liveStreamWordIndex = 0;
    liveSentenceIndex++;

    if (ingested) {
      broadcastWs({
        type: 'segment_finalized',
        recordingState,
        transcriptId: ingested.transcriptId,
        sessionId: ingested.sessionId,
        text: ingested.analysis.cleanText,
        wordCount: ingested.analysis.totalWords,
        wpm: ingested.analysis.wpm,
        fillerCount: ingested.analysis.totalFillerCount,
        detectedTopic: ingested.analysis.detectedTopic,
        speaker: ingested.speaker,
        timestamp: nowIso,
      });
    }
  }
}, 950);

// Helper to get today's UTC date string
function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function getYesterdayStr(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// 1. GET /api/dashboard
app.get('/api/dashboard', (req, res) => {
  try {
    const todayStr = (req.query.date as string) || getTodayStr();
    const speakerFilter = (req.query.speakerFilter as string) || 'all'; // 'all' | 'primary' | 'other'
    const yesterdayStr = getYesterdayStr();

    recalculateDailyStatistics(todayStr);

    const todayStats = (db
      .prepare('SELECT * FROM daily_statistics WHERE date_str = ?')
      .get(todayStr) as any) || {
      date_str: todayStr,
      total_words: 0,
      primary_user_words: 0,
      other_speaker_words: 0,
      speaking_duration_seconds: 0,
      session_count: 0,
      unique_vocabulary: 0,
      avg_wpm: 0,
      filler_count: 0,
      filler_percentage: 0,
      top_topic: 'General Reflection',
    };

    const yesterdayStats = (db
      .prepare('SELECT * FROM daily_statistics WHERE date_str = ?')
      .get(yesterdayStr) as any) || {
      total_words: 0,
      primary_user_words: 0,
      other_speaker_words: 0,
      speaking_duration_seconds: 0,
      avg_wpm: 0,
      filler_percentage: 0,
    };

    const weeklyTrend = db
      .prepare(`
        SELECT date_str, total_words, primary_user_words, other_speaker_words,
               speaking_duration_seconds, avg_wpm, filler_count, filler_percentage, top_topic
        FROM daily_statistics
        ORDER BY date_str DESC
        LIMIT 7
      `)
      .all()
      .reverse();

    let recentTranscriptsQuery = `
      SELECT * FROM transcripts
      WHERE substr(start_time, 1, 10) = ?
    `;
    if (speakerFilter === 'primary') {
      recentTranscriptsQuery += ' AND is_primary_user = 1';
    } else if (speakerFilter === 'other') {
      recentTranscriptsQuery += ' AND is_primary_user = 0';
    }
    recentTranscriptsQuery += ' ORDER BY start_time DESC LIMIT 12';

    const recentTranscripts = db.prepare(recentTranscriptsQuery).all(todayStr);

    // Speaker Separation Breakdown for today
    const speakerBreakdown = db
      .prepare(`
        SELECT
          speaker_id,
          speaker_label,
          is_primary_user,
          predicted_role,
          ROUND(AVG(pitch_hz)) as avg_pitch_hz,
          ROUND(AVG(speaker_confidence), 2) as avg_confidence,
          SUM(word_count) as total_words,
          COUNT(*) as segment_count,
          ROUND(AVG(wpm)) as avg_wpm,
          SUM(filler_count) as filler_count
        FROM transcripts
        WHERE substr(start_time, 1, 10) = ?
        GROUP BY speaker_id
        ORDER BY is_primary_user DESC, total_words DESC
      `)
      .all(todayStr);

    const longestSession = db
      .prepare(`
        SELECT title, duration_seconds, total_words, avg_wpm
        FROM speech_sessions
        ORDER BY duration_seconds DESC
        LIMIT 1
      `)
      .get();

    const health = db.prepare('SELECT * FROM system_health WHERE id = 1').get() as any;

    res.json({
      date: todayStr,
      recordingState,
      simulationRunning,
      today: todayStats,
      yesterday: yesterdayStats,
      comparison: {
        wordsDeltaPercent:
          yesterdayStats.total_words > 0
            ? Math.round(((todayStats.total_words - yesterdayStats.total_words) / yesterdayStats.total_words) * 100)
            : 100,
        myWordsDeltaPercent:
          yesterdayStats.primary_user_words > 0
            ? Math.round(
                ((todayStats.primary_user_words - yesterdayStats.primary_user_words) /
                  yesterdayStats.primary_user_words) *
                  100
              )
            : 100,
        wpmDelta: todayStats.avg_wpm - (yesterdayStats.avg_wpm || 0),
        fillerRateDelta: Number((todayStats.filler_percentage - (yesterdayStats.filler_percentage || 0)).toFixed(2)),
      },
      weeklyTrend,
      speakerBreakdown,
      recentTranscripts,
      longestSession,
      systemHealth: {
        ...health,
        recording_state: recordingState,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GET /api/statistics/hourly
app.get('/api/statistics/hourly', (req, res) => {
  try {
    const dateStr = (req.query.date as string) || getTodayStr();
    const rows = db
      .prepare(`
        SELECT * FROM hourly_statistics
        WHERE date_str = ?
        ORDER BY hour_num ASC
      `)
      .all(dateStr) as any[];

    const byHour = new Map<number, any>();
    for (const r of rows) {
      byHour.set(r.hour_num, r);
    }

    const full24Hours = [];
    for (let h = 0; h < 24; h++) {
      const found = byHour.get(h);
      full24Hours.push({
        hour: h,
        label: `${String(h).padStart(2, '0')}:00`,
        wordCount: found ? found.word_count : 0,
        primaryUserWords: found ? found.primary_user_words : 0,
        otherSpeakerWords: found ? found.other_speaker_words : 0,
        durationSeconds: found ? found.speaking_duration_seconds : 0,
        avgWpm: found ? found.avg_wpm : 0,
        fillerCount: found ? found.filler_count : 0,
        topTopic: found ? found.top_topic : 'None',
      });
    }

    res.json({ date: dateStr, hours: full24Hours });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. GET /api/statistics/daily
app.get('/api/statistics/daily', (req, res) => {
  try {
    const dateStr = (req.query.date as string) || getTodayStr();
    recalculateDailyStatistics(dateStr);

    const stats = db.prepare('SELECT * FROM daily_statistics WHERE date_str = ?').get(dateStr);
    const topWords = db
      .prepare(`
        SELECT normalized_word as word,
               COUNT(*) as count,
               SUM(CASE WHEN is_primary_user = 1 THEN 1 ELSE 0 END) as my_count,
               SUM(CASE WHEN is_primary_user = 0 THEN 1 ELSE 0 END) as other_count
        FROM words
        WHERE substr(spoken_at, 1, 10) = ? AND is_filler = 0 AND length(normalized_word) > 3
        GROUP BY normalized_word
        ORDER BY count DESC
        LIMIT 12
      `)
      .all(dateStr);

    const topTopics = db
      .prepare(`
        SELECT detected_topic as topic,
               SUM(word_count) as words,
               COUNT(*) as segments
        FROM transcripts
        WHERE substr(start_time, 1, 10) = ?
        GROUP BY detected_topic
        ORDER BY words DESC
      `)
      .all(dateStr);

    const summary = db.prepare('SELECT * FROM ai_summaries WHERE date_str = ?').get(dateStr);

    res.json({
      date: dateStr,
      stats,
      topWords,
      topTopics,
      summary,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. GET /api/statistics/weekly & /api/statistics/monthly
app.get('/api/statistics/weekly', (_req, res) => {
  try {
    const days = db
      .prepare(`
        SELECT * FROM daily_statistics
        ORDER BY date_str DESC
        LIMIT 7
      `)
      .all()
      .reverse();

    const calendarDays = db
      .prepare(`
        SELECT date_str, total_words, primary_user_words, other_speaker_words,
               speaking_duration_seconds, session_count, avg_wpm, filler_percentage, top_topic
        FROM daily_statistics
        ORDER BY date_str DESC
        LIMIT 30
      `)
      .all();

    res.json({ days, calendarDays });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/statistics/monthly', (_req, res) => {
  try {
    const days = db
      .prepare(`
        SELECT * FROM daily_statistics
        ORDER BY date_str DESC
        LIMIT 30
      `)
      .all()
      .reverse();

    const totals = db
      .prepare(`
        SELECT
          SUM(total_words) as total_words,
          SUM(primary_user_words) as primary_user_words,
          SUM(other_speaker_words) as other_speaker_words,
          SUM(speaking_duration_seconds) as total_duration,
          ROUND(AVG(total_words)) as daily_avg_words,
          ROUND(AVG(avg_wpm)) as avg_wpm,
          MAX(total_words) as peak_day_words
        FROM daily_statistics
      `)
      .get();

    res.json({ days, totals });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. GET /api/vocabulary — Includes Expanded Filler Word Intelligence & Trigger Context Analysis
app.get('/api/vocabulary', (req, res) => {
  try {
    const speakerFilter = (req.query.speakerFilter as string) || 'all'; // 'all' | 'primary' | 'other'

    let wordWhere = 'WHERE is_filler = 0 AND length(normalized_word) > 3';
    if (speakerFilter === 'primary') {
      wordWhere += ' AND primary_user_count > 0';
    } else if (speakerFilter === 'other') {
      wordWhere += ' AND other_speaker_count > 0';
    }

    const topVocabulary = db
      .prepare(`
        SELECT normalized_word as word,
               total_count,
               primary_user_count,
               other_speaker_count,
               first_spoken_at,
               last_spoken_at
        FROM word_statistics
        ${wordWhere}
        ORDER BY total_count DESC
        LIMIT 20
      `)
      .all();

    // Filler word frequency breakdown
    let fillerWhere = '';
    if (speakerFilter === 'primary') {
      fillerWhere = 'WHERE is_primary_user = 1';
    } else if (speakerFilter === 'other') {
      fillerWhere = 'WHERE is_primary_user = 0';
    }

    const fillerBreakdown = db
      .prepare(`
        SELECT
          filler_phrase as phrase,
          category,
          COUNT(*) as count,
          SUM(CASE WHEN is_primary_user = 1 THEN 1 ELSE 0 END) as my_count,
          SUM(CASE WHEN is_primary_user = 0 THEN 1 ELSE 0 END) as other_count
        FROM filler_word_statistics
        ${fillerWhere}
        GROUP BY filler_phrase, category
        ORDER BY count DESC
      `)
      .all();

    // Filler trigger context analysis
    const fillerTriggers = db
      .prepare(`
        SELECT
          trigger_context as triggerContext,
          COUNT(*) as count,
          GROUP_CONCAT(DISTINCT filler_phrase) as commonPhrases
        FROM filler_word_statistics
        ${fillerWhere}
        GROUP BY trigger_context
        ORDER BY count DESC
      `)
      .all();

    // Filler sentence position analysis
    const fillerPositions = db
      .prepare(`
        SELECT
          position,
          COUNT(*) as count
        FROM filler_word_statistics
        ${fillerWhere}
        GROUP BY position
        ORDER BY count DESC
      `)
      .all();

    // Filler trend per session
    const fillerPerSession = db
      .prepare(`
        SELECT
          id as sessionId,
          title,
          start_time,
          total_words,
          filler_count,
          ROUND((CAST(filler_count AS REAL) / MAX(total_words, 1)) * 100, 2) as filler_percentage,
          primary_topic
        FROM speech_sessions
        ORDER BY start_time DESC
        LIMIT 10
      `)
      .all();

    // Filler occurrences with surrounding context snippets
    const recentFillerOccurrences = db
      .prepare(`
        SELECT
          f.id,
          f.filler_phrase as phrase,
          f.category,
          f.position,
          f.trigger_context as triggerContext,
          f.snippet,
          f.spoken_at as spokenAt,
          f.is_primary_user as isPrimaryUser,
          t.speaker_label as speakerLabel,
          t.detected_topic as topic
        FROM filler_word_statistics f
        LEFT JOIN transcripts t ON t.id = f.transcript_id
        ${fillerWhere ? fillerWhere.replace('is_primary_user', 'f.is_primary_user') : ''}
        ORDER BY f.spoken_at DESC
        LIMIT 18
      `)
      .all();

    // Daily vocabulary growth & filler rate trend
    const dailyFillerTrend = db
      .prepare(`
        SELECT
          date_str,
          total_words,
          unique_vocabulary,
          filler_count,
          filler_percentage,
          avg_wpm
        FROM daily_statistics
        ORDER BY date_str ASC
        LIMIT 14
      `)
      .all();

    const totalUniqueWords = (
      db.prepare('SELECT COUNT(*) as c FROM word_statistics WHERE is_filler = 0').get() as any
    ).c;

    res.json({
      totalUniqueWords,
      topVocabulary,
      fillerBreakdown,
      fillerTriggers,
      fillerPositions,
      fillerPerSession,
      recentFillerOccurrences,
      dailyFillerTrend,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. GET /api/speakers — Voice Separation & Other Voice Prediction Analytics
app.get('/api/speakers', (_req, res) => {
  try {
    const speakers = db
      .prepare(`
        SELECT
          speaker_id as speakerId,
          speaker_label as speakerLabel,
          is_primary_user as isPrimaryUser,
          predicted_role as predictedRole,
          ROUND(AVG(pitch_hz)) as avgPitchHz,
          ROUND(AVG(speaker_confidence), 2) as avgConfidence,
          SUM(word_count) as totalWords,
          COUNT(*) as segmentCount,
          ROUND(AVG(wpm)) as avgWpm,
          SUM(filler_count) as fillerCount,
          MAX(start_time) as lastActiveAt
        FROM transcripts
        GROUP BY speaker_id
        ORDER BY is_primary_user DESC, totalWords DESC
      `)
      .all();

    res.json({
      profiles: DEFAULT_VOICE_PROFILES,
      detectedSpeakers: speakers,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/speakers/relabel — Reassign or confirm a predicted speaker voice profile
app.post('/api/speakers/relabel', (req, res) => {
  try {
    const { speakerId, newLabel, newRole, isPrimaryUser } = req.body;
    if (!speakerId || !newLabel) {
      return res.status(400).json({ error: 'speakerId and newLabel are required' });
    }

    const isPrimaryInt = isPrimaryUser ? 1 : 0;
    db.prepare(`
      UPDATE transcripts
      SET speaker_label = ?, predicted_role = ?, is_primary_user = ?
      WHERE speaker_id = ?
    `).run(newLabel.trim(), (newRole || 'Verified Speaker').trim(), isPrimaryInt, speakerId);

    db.prepare(`
      UPDATE audio_segments
      SET speaker_label = ?, predicted_role = ?, is_primary_user = ?
      WHERE speaker_id = ?
    `).run(newLabel.trim(), (newRole || 'Verified Speaker').trim(), isPrimaryInt, speakerId);

    recalculateDailyStatistics(getTodayStr());
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. GET /api/topics & POST /api/topics
app.get('/api/topics', (_req, res) => {
  try {
    const topics = db
      .prepare('SELECT * FROM topics ORDER BY total_words DESC')
      .all();
    res.json({ topics });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/topics', (req, res) => {
  try {
    const { name, category, colorHex } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Topic name is required' });
    }
    const cleanName = name.trim();
    const id = `top_custom_${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    db.prepare(`
      INSERT INTO topics (id, name, category, is_custom, total_words, segment_count, color_hex)
      VALUES (?, ?, ?, 1, 0, 0, ?)
      ON CONFLICT(name) DO UPDATE SET
        category = excluded.category,
        color_hex = excluded.color_hex
    `).run(id, cleanName, category || 'Custom', colorHex || '#6366F1');

    const topics = db.prepare('SELECT * FROM topics ORDER BY total_words DESC').all();
    res.json({ success: true, topics });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. GET /api/transcripts, PUT /api/transcripts/:id, DELETE /api/transcripts/:id, POST /api/transcripts/ingest
app.get('/api/transcripts', (req, res) => {
  try {
    const q = ((req.query.q as string) || '').trim();
    const date = ((req.query.date as string) || '').trim();
    const topic = ((req.query.topic as string) || '').trim();
    const speaker = ((req.query.speaker as string) || '').trim(); // 'all' | 'primary' | 'other' or speaker_id

    let sql = 'SELECT * FROM transcripts WHERE 1=1';
    const params: any[] = [];

    if (q) {
      sql += ' AND LOWER(recognized_text) LIKE ?';
      params.push(`%${q.toLowerCase()}%`);
    }
    if (date) {
      sql += ' AND substr(start_time, 1, 10) = ?';
      params.push(date);
    }
    if (topic && topic !== 'All') {
      sql += ' AND detected_topic = ?';
      params.push(topic);
    }
    if (speaker === 'primary') {
      sql += ' AND is_primary_user = 1';
    } else if (speaker === 'other') {
      sql += ' AND is_primary_user = 0';
    } else if (speaker && speaker !== 'all') {
      sql += ' AND speaker_id = ?';
      params.push(speaker);
    }

    sql += ' ORDER BY start_time DESC LIMIT 100';
    const transcripts = db.prepare(sql).all(...params);
    const sessions = db.prepare('SELECT * FROM speech_sessions ORDER BY start_time DESC LIMIT 30').all();

    res.json({ transcripts, sessions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/transcripts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { recognized_text, detected_topic, is_primary_user, speaker_label, predicted_role } = req.body;
    if (!recognized_text || !recognized_text.trim()) {
      return res.status(400).json({ error: 'Transcript text cannot be empty' });
    }

    const existing = db.prepare('SELECT * FROM transcripts WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    const durationSec = Math.max(
      5,
      Math.round((new Date(existing.end_time).getTime() - new Date(existing.start_time).getTime()) / 1000)
    );
    const analysis = analyzeSpeechSegment(recognized_text, durationSec);

    db.prepare(`
      UPDATE transcripts
      SET recognized_text = ?,
          word_count = ?,
          wpm = ?,
          detected_topic = ?,
          filler_count = ?,
          filler_percentage = ?,
          is_primary_user = COALESCE(?, is_primary_user),
          speaker_label = COALESCE(?, speaker_label),
          predicted_role = COALESCE(?, predicted_role)
      WHERE id = ?
    `).run(
      analysis.cleanText,
      analysis.totalWords,
      analysis.wpm,
      detected_topic || analysis.detectedTopic,
      analysis.totalFillerCount,
      analysis.fillerPercentage,
      typeof is_primary_user === 'boolean' ? (is_primary_user ? 1 : 0) : null,
      speaker_label || null,
      predicted_role || null,
      id
    );

    const dateStr = existing.start_time.slice(0, 10);
    recalculateDailyStatistics(dateStr);

    const updated = db.prepare('SELECT * FROM transcripts WHERE id = ?').get(id);
    res.json({ success: true, transcript: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/transcripts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM transcripts WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    const dateStr = existing.start_time.slice(0, 10);
    db.prepare('DELETE FROM filler_word_statistics WHERE transcript_id = ?').run(id);
    db.prepare('DELETE FROM words WHERE transcript_id = ?').run(id);
    db.prepare('DELETE FROM transcripts WHERE id = ?').run(id);
    db.prepare('DELETE FROM audio_segments WHERE id = ?').run(existing.segment_id);

    recalculateDailyStatistics(dateStr);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/transcripts/ingest — Ingest a real or simulated utterance immediately
app.post('/api/transcripts/ingest', (req, res) => {
  try {
    const { text, durationSeconds, sessionTitle, pitchHz, spectralCentroidHz, speakerProfileId } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Speech text is required' });
    }

    let acoustics = {
      pitchHz: Number(pitchHz) || 132,
      energyRms: 0.52,
      spectralCentroidHz: Number(spectralCentroidHz) || 1650,
    };

    if (speakerProfileId) {
      const foundProfile = DEFAULT_VOICE_PROFILES.find((p) => p.speakerId === speakerProfileId);
      if (foundProfile) {
        acoustics = {
          pitchHz: foundProfile.referencePitchHz,
          energyRms: 0.5,
          spectralCentroidHz: foundProfile.referenceCentroidHz,
        };
      }
    }

    const nowIso = new Date().toISOString();
    const result = ingestSpeechSegment({
      sessionTitle: sessionTitle || 'Live Microphone Capture',
      text: text.trim(),
      startTimeIso: nowIso,
      durationSeconds: Number(durationSeconds) || Math.max(5, Math.round(text.trim().split(/\s+/).length * 0.45)),
      acoustics,
    });

    if (result) {
      broadcastWs({
        type: 'segment_finalized',
        recordingState,
        transcriptId: result.transcriptId,
        sessionId: result.sessionId,
        text: result.analysis.cleanText,
        wordCount: result.analysis.totalWords,
        wpm: result.analysis.wpm,
        fillerCount: result.analysis.totalFillerCount,
        detectedTopic: result.analysis.detectedTopic,
        speaker: result.speaker,
        timestamp: nowIso,
      });
    }

    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. GET /api/summaries & POST /api/summaries/generate
app.get('/api/summaries', (req, res) => {
  try {
    const dateStr = (req.query.date as string) || getTodayStr();
    const summary = db.prepare('SELECT * FROM ai_summaries WHERE date_str = ?').get(dateStr) as any;
    const allSummaries = db.prepare('SELECT * FROM ai_summaries ORDER BY date_str DESC LIMIT 14').all();

    res.json({
      date: dateStr,
      summary,
      allSummaries,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/summaries/generate', async (req, res) => {
  try {
    const dateStr = (req.body.date as string) || getTodayStr();
    const transcripts = db
      .prepare(`
        SELECT * FROM transcripts
        WHERE substr(start_time, 1, 10) = ?
        ORDER BY start_time ASC
      `)
      .all(dateStr) as any[];

    if (transcripts.length === 0) {
      return res.status(400).json({ error: `No transcripts recorded on ${dateStr} to summarize.` });
    }

    const combinedText = transcripts.map((t) => `[${t.start_time.slice(11, 16)} - ${t.speaker_label}]: ${t.recognized_text}`).join('\n');
    const insights = extractInsightsFromText(transcripts.map((t) => t.recognized_text).join(' '));
    const distinctTopics = Array.from(new Set(transcripts.map((t) => t.detected_topic)));

    let overview = `Analyzed ${transcripts.length} speech segments (${transcripts.reduce((a, b) => a + b.word_count, 0)} words) recorded on ${dateStr}. Primary focus areas included ${distinctTopics.join(', ')}.`;
    let providerUsed = 'Local Deterministic Analytics Engine';

    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
      try {
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Summarize the following personal speech transcripts recorded on ${dateStr} in 2 concise sentences highlighting key technical, work, and personal discussions, distinguishing between the primary user and other detected voices:\n\n${combinedText}`,
        });
        if (response.text) {
          overview = response.text.trim();
          providerUsed = 'Google Gemini (gemini-4-hydrogen)';
        }
      } catch (_aiErr) {
        // Fallback smoothly to deterministic summary if key is not configured
      }
    }

    const discussions = transcripts.slice(0, 5).map((t) => `${t.speaker_label} (${t.detected_topic}): "${t.recognized_text.slice(0, 110)}..."`);

    db.prepare(`
      INSERT OR REPLACE INTO ai_summaries (
        date_str, overview, main_topics_json, important_discussions_json,
        decisions_json, commitments_json, questions_json, recurring_themes_json,
        generated_at, provider_used
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      dateStr,
      overview,
      JSON.stringify(distinctTopics),
      JSON.stringify(discussions),
      JSON.stringify(insights.decisions.length > 0 ? insights.decisions : ['Maintained local SQLite WAL storage and speaker separation filtering.']),
      JSON.stringify(insights.commitments.length > 0 ? insights.commitments : ['Continue monitoring filler word reduction during technical explanations.']),
      JSON.stringify(insights.questions),
      JSON.stringify(['Edge speech intelligence', 'Voice separation & acoustic prediction', 'Filler word mindfulness']),
      new Date().toISOString(),
      providerUsed
    );

    const updatedSummary = db.prepare('SELECT * FROM ai_summaries WHERE date_str = ?').get(dateStr);
    res.json({ success: true, summary: updatedSummary });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 10. POST /api/ai/chat — Conversational AI over stored personal speech database with source citations
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const qLower = question.toLowerCase();
    const todayStr = getTodayStr();

    // Retrieve relevant database records first (RAG grounding)
    const todayStats = db.prepare('SELECT * FROM daily_statistics WHERE date_str = ?').get(todayStr) as any;
    const allTranscripts = db
      .prepare('SELECT * FROM transcripts ORDER BY start_time DESC LIMIT 35')
      .all() as any[];
    const topFillers = db
      .prepare('SELECT filler_phrase, category, COUNT(*) as count FROM filler_word_statistics GROUP BY filler_phrase ORDER BY count DESC LIMIT 6')
      .all() as any[];
    const topWords = db
      .prepare('SELECT normalized_word, total_count FROM word_statistics WHERE is_filler = 0 AND length(normalized_word) > 3 ORDER BY total_count DESC LIMIT 10')
      .all() as any[];
    const speakers = db
      .prepare('SELECT speaker_label, is_primary_user, predicted_role, SUM(word_count) as words, ROUND(AVG(pitch_hz)) as pitch FROM transcripts GROUP BY speaker_id')
      .all() as any[];

    // Find matching transcripts for citations
    const keywords = qLower
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w: string) => w.length > 3 && !['what', 'when', 'where', 'many', 'talk', 'talked', 'about', 'today', 'week', 'month', 'speaking', 'words', 'voice', 'voices'].includes(w));

    let matchedTranscripts = allTranscripts.filter((t) =>
      keywords.some((kw: string) => t.recognized_text.toLowerCase().includes(kw) || t.detected_topic.toLowerCase().includes(kw))
    );

    if (matchedTranscripts.length === 0) {
      matchedTranscripts = allTranscripts.slice(0, 4);
    } else {
      matchedTranscripts = matchedTranscripts.slice(0, 4);
    }

    const citations = matchedTranscripts.map((t) => ({
      transcriptId: t.id,
      timestamp: t.start_time,
      speakerLabel: t.speaker_label,
      isPrimaryUser: Boolean(t.is_primary_user),
      topic: t.detected_topic,
      snippet: t.recognized_text,
    }));

    // Build deterministic grounded answer first
    let answer = '';
    if (qLower.includes('filler')) {
      const fillerSummary = topFillers.map((f) => `"${f.filler_phrase}" (${f.count}x, ${f.category})`).join(', ');
      answer = `Based on your stored speech database, your most frequent filler words are ${fillerSummary || 'none recorded'}. Today's overall filler rate is ${todayStats?.filler_percentage ?? 0}% (${todayStats?.filler_count ?? 0} filler occurrences across ${todayStats?.total_words ?? 0} total words). Context analysis shows most qualifiers ("basically", "sort of") occur during technical explanations and mid-clause transitions.`;
    } else if (qLower.includes('voice') || qLower.includes('speaker') || qLower.includes('other') || qLower.includes('who')) {
      const spkSummary = speakers
        .map((s) => `${s.speaker_label} [${s.is_primary_user ? 'Primary Owner' : `Predicted: ${s.predicted_role}`}, ~${s.pitch}Hz]: ${s.words} words`)
        .join(' | ');
      answer = `Acoustic voice separation has distinguished ${speakers.length} voice profiles across your recordings: ${spkSummary}. Today, your primary voice accounted for ${todayStats?.primary_user_words ?? 0} words while other detected voices spoke ${todayStats?.other_speaker_words ?? 0} words.`;
    } else if (qLower.includes('how many words') || qLower.includes('word count') || qLower.includes('speak')) {
      const weekTotal = (db.prepare('SELECT SUM(total_words) as w, SUM(primary_user_words) as mw, SUM(other_speaker_words) as ow FROM daily_statistics').get() as any);
      answer = `Today (${todayStr}) you and your environment recorded ${todayStats?.total_words ?? 0} total words (${todayStats?.primary_user_words ?? 0} spoken by your primary voice and ${todayStats?.other_speaker_words ?? 0} by other detected voices) at an average speed of ${todayStats?.avg_wpm ?? 0} WPM. Across the last 7 days, the database holds ${weekTotal?.w ?? 0} words (${weekTotal?.mw ?? 0} yours, ${weekTotal?.ow ?? 0} other voices).`;
    } else if (qLower.includes('decision') || qLower.includes('plan') || qLower.includes('commit')) {
      const todaySummary = db.prepare('SELECT * FROM ai_summaries WHERE date_str = ?').get(todayStr) as any;
      const decisions = todaySummary ? JSON.parse(todaySummary.decisions_json) : [];
      const commitments = todaySummary ? JSON.parse(todaySummary.commitments_json) : [];
      answer = `From your recorded transcripts, key decisions include: ${decisions.join(' ')} Key commitments and action items: ${commitments.join(' ')}`;
    } else {
      const recentTopics = Array.from(new Set(matchedTranscripts.map((t) => t.detected_topic))).join(', ');
      answer = `In your stored transcripts covering ${recentTopics}, you discussed: ${matchedTranscripts
        .map((t) => `[${t.start_time.slice(11, 16)} ${t.speaker_label}] "${t.recognized_text}"`)
        .join(' ')}`;
    }

    // Enhance with server-side Gemini if API key is available (with 2500ms fast fallback budget)
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
      try {
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        const contextPayload = JSON.stringify({
          todayStats,
          speakers,
          topFillers,
          topWords,
          relevantTranscripts: citations,
        });
        const response = await Promise.race([
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: `You are the Personal AI Speech Intelligence Assistant running on the user's Raspberry Pi. Answer the user's question ONLY using the verified SQLite speech database records below. Never invent transcripts or stats. Cite timestamps and speaker labels.\n\nDatabase Records:\n${contextPayload}\n\nUser Question: ${question}`,
          }),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
        ]);
        if (response && response.text) {
          answer = response.text.trim();
        }
      } catch (_e) {
        // Keep deterministic grounded answer on timeout or error
      }
    }

    const convId = `chat_${Date.now()}`;
    const createdAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO ai_conversations (id, question, answer, citations_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(convId, question.trim(), answer, JSON.stringify(citations), createdAt);

    res.json({
      id: convId,
      question: question.trim(),
      answer,
      citations,
      createdAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ai/conversations', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM ai_conversations ORDER BY created_at DESC LIMIT 20').all() as any[];
    const conversations = rows.map((r) => ({
      id: r.id,
      question: r.question,
      answer: r.answer,
      citations: JSON.parse(r.citations_json || '[]'),
      createdAt: r.created_at,
    }));
    res.json({ conversations });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Recording Controls: POST /api/recording/start, /pause, /stop, /simulation
app.post('/api/recording/start', (_req, res) => {
  recordingState = 'active';
  db.prepare('UPDATE system_health SET recording_state = ?, updated_at = ? WHERE id = 1').run('active', new Date().toISOString());
  db.prepare('INSERT INTO recording_events (event_type, details, created_at) VALUES (?, ?, ?)').run(
    'RECORDING_RESUMED',
    'Continuous Silero VAD microphone capture activated',
    new Date().toISOString()
  );
  broadcastWs({ type: 'status', recordingState, simulationRunning, timestamp: new Date().toISOString() });
  res.json({ recordingState, simulationRunning });
});

app.post('/api/recording/pause', (_req, res) => {
  recordingState = 'paused';
  db.prepare('UPDATE system_health SET recording_state = ?, updated_at = ? WHERE id = 1').run('paused', new Date().toISOString());
  db.prepare('INSERT INTO recording_events (event_type, details, created_at) VALUES (?, ?, ?)').run(
    'RECORDING_PAUSED',
    'Microphone capture paused by user privacy toggle',
    new Date().toISOString()
  );
  broadcastWs({ type: 'status', recordingState, simulationRunning, timestamp: new Date().toISOString() });
  res.json({ recordingState, simulationRunning });
});

app.post('/api/recording/stop', (_req, res) => {
  recordingState = 'stopped';
  partialWordsBuffer = [];
  liveStreamWordIndex = 0;
  db.prepare('UPDATE system_health SET recording_state = ?, updated_at = ? WHERE id = 1').run('stopped', new Date().toISOString());
  db.prepare('INSERT INTO recording_events (event_type, details, created_at) VALUES (?, ?, ?)').run(
    'RECORDING_STOPPED',
    'Microphone capture stopped and buffer flushed',
    new Date().toISOString()
  );
  broadcastWs({ type: 'status', recordingState, simulationRunning, timestamp: new Date().toISOString() });
  res.json({ recordingState, simulationRunning });
});

app.post('/api/recording/simulation', (req, res) => {
  simulationRunning = Boolean(req.body.enabled);
  broadcastWs({ type: 'status', recordingState, simulationRunning, timestamp: new Date().toISOString() });
  res.json({ recordingState, simulationRunning });
});

// 12. GET /api/system/health & Settings & Data Export/Delete
app.get('/api/system/health', (_req, res) => {
  try {
    const health = db.prepare('SELECT * FROM system_health WHERE id = 1').get() as any;
    const events = db.prepare('SELECT * FROM recording_events ORDER BY created_at DESC LIMIT 12').all();
    const tableCounts = {
      speech_sessions: (db.prepare('SELECT COUNT(*) as c FROM speech_sessions').get() as any).c,
      audio_segments: (db.prepare('SELECT COUNT(*) as c FROM audio_segments').get() as any).c,
      transcripts: (db.prepare('SELECT COUNT(*) as c FROM transcripts').get() as any).c,
      words: (db.prepare('SELECT COUNT(*) as c FROM words').get() as any).c,
      filler_word_statistics: (db.prepare('SELECT COUNT(*) as c FROM filler_word_statistics').get() as any).c,
      topics: (db.prepare('SELECT COUNT(*) as c FROM topics').get() as any).c,
      ai_summaries: (db.prepare('SELECT COUNT(*) as c FROM ai_summaries').get() as any).c,
    };

    res.json({
      health: {
        ...health,
        recording_state: recordingState,
      },
      events,
      tableCounts,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/settings', (_req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM user_settings').all() as Array<{ key: string; value: string }>;
    const settings: Record<string, string> = {};
    for (const r of rows) {
      settings[r.key] = r.value;
    }
    res.json({ settings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/settings', (req, res) => {
  try {
    const updates = req.body.settings || req.body;
    const stmt = db.prepare('INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)');
    const tx = db.transaction(() => {
      for (const [k, v] of Object.entries(updates)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          stmt.run(k, String(v));
        }
      }
    });
    tx();

    const rows = db.prepare('SELECT key, value FROM user_settings').all() as Array<{ key: string; value: string }>;
    const settings: Record<string, string> = {};
    for (const r of rows) {
      settings[r.key] = r.value;
    }
    res.json({ success: true, settings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/data/export', (_req, res) => {
  try {
    const transcripts = db.prepare('SELECT * FROM transcripts ORDER BY start_time DESC').all();
    const dailyStats = db.prepare('SELECT * FROM daily_statistics ORDER BY date_str DESC').all();
    const fillerStats = db.prepare('SELECT * FROM filler_word_statistics ORDER BY spoken_at DESC').all();
    const summaries = db.prepare('SELECT * FROM ai_summaries ORDER BY date_str DESC').all();
    const settings = db.prepare('SELECT * FROM user_settings').all();

    const payload = {
      exportedAt: new Date().toISOString(),
      platform: 'VoxPi Personal AI Speech Intelligence System',
      transcripts,
      dailyStats,
      fillerStats,
      summaries,
      settings,
    };

    const jsonStr = JSON.stringify(payload, null, 2);
    db.prepare(`
      INSERT INTO data_exports (id, export_format, record_count, file_size_bytes, created_at)
      VALUES (?, 'JSON', ?, ?, ?)
    `).run(`exp_${Date.now()}`, transcripts.length, Buffer.byteLength(jsonStr, 'utf8'), new Date().toISOString());

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="voxpi-speech-intelligence-backup.json"');
    res.send(jsonStr);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Vite middleware or production static serving
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve(process.cwd(), 'dist/index.html'));

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`VoxPi Speech Intelligence Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
