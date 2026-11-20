export interface DailyStat {
  date_str: string;
  total_words: number;
  primary_user_words: number;
  other_speaker_words: number;
  speaking_duration_seconds: number;
  session_count: number;
  unique_vocabulary: number;
  avg_wpm: number;
  filler_count: number;
  filler_percentage: number;
  top_topic: string;
}

export interface SpeakerBreakdownItem {
  speaker_id: string;
  speaker_label: string;
  is_primary_user: number;
  predicted_role: string;
  avg_pitch_hz: number;
  avg_confidence: number;
  total_words: number;
  segment_count: number;
  avg_wpm: number;
  filler_count: number;
}

export interface TranscriptRecord {
  id: string;
  segment_id: string;
  session_id: string;
  start_time: string;
  end_time: string;
  recognized_text: string;
  word_count: number;
  wpm: number;
  confidence_score: number;
  processing_status: string;
  detected_topic: string;
  filler_count: number;
  filler_percentage: number;
  speaker_id: string;
  speaker_label: string;
  is_primary_user: number;
  predicted_role: string;
  speaker_confidence: number;
  pitch_hz: number;
}

export interface LivePartialStreamEvent {
  type: 'partial_transcript';
  recordingState: 'active' | 'paused' | 'stopped';
  word: string;
  isFiller: boolean;
  partialText: string;
  wordIndex: number;
  totalWordsInUtterance: number;
  speaker: {
    speakerId: string;
    speakerLabel: string;
    isPrimaryUser: boolean;
    predictedRole: string;
    pitchHz: number;
    confidence: number;
  };
  timestamp: string;
}

export interface SegmentFinalizedEvent {
  type: 'segment_finalized';
  recordingState: 'active' | 'paused' | 'stopped';
  transcriptId: string;
  sessionId: string;
  text: string;
  wordCount: number;
  wpm: number;
  fillerCount: number;
  detectedTopic: string;
  speaker: {
    speakerId: string;
    speakerLabel: string;
    isPrimaryUser: boolean;
    predictedRole: string;
    pitchHz: number;
    confidence: number;
  };
  timestamp: string;
}
