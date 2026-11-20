export interface WordToken {
  word: string;
  normalized: string;
  index: number;
  isFiller: boolean;
  fillerCategory?: 'hesitation' | 'hedging' | 'discourse_marker' | 'qualifier';
  startOffsetMs: number;
  endOffsetMs: number;
}

export interface FillerOccurrence {
  fillerPhrase: string;
  category: 'hesitation' | 'hedging' | 'discourse_marker' | 'qualifier';
  position: 'sentence_start' | 'mid_clause_transition' | 'clause_end';
  triggerContext: 'technical_explanation' | 'planning_commitment' | 'uncertainty_hedging' | 'topic_transition' | 'general_discourse';
  snippet: string;
  wordIndex: number;
}

export interface AcousticFeatures {
  pitchHz: number;
  energyRms: number;
  spectralCentroidHz: number;
}

export interface SpeakerPrediction {
  speakerId: string;
  speakerLabel: string;
  isPrimaryUser: boolean;
  confidence: number;
  predictedRole: string;
  vocalCharacteristics: {
    pitchHz: number;
    vocalRange: 'low_baritone' | 'mid_tenor' | 'alto_mezzo' | 'soprano_high';
    voiceprintSimilarity: number;
  };
}

export interface KnownVoiceProfile {
  speakerId: string;
  speakerLabel: string;
  isPrimaryUser: boolean;
  predictedRole: string;
  referencePitchHz: number;
  referenceCentroidHz: number;
}

export const DEFAULT_VOICE_PROFILES: KnownVoiceProfile[] = [
  {
    speakerId: 'spk_primary_owner',
    speakerLabel: 'My Voice (Primary User)',
    isPrimaryUser: true,
    predictedRole: 'Owner / Device Host',
    referencePitchHz: 132,
    referenceCentroidHz: 1650,
  },
  {
    speakerId: 'spk_guest_colleague',
    speakerLabel: 'Voice B (Predicted: Tech Colleague)',
    isPrimaryUser: false,
    predictedRole: 'Engineering Peer / Collaborator',
    referencePitchHz: 178,
    referenceCentroidHz: 2100,
  },
  {
    speakerId: 'spk_guest_partner',
    speakerLabel: 'Voice C (Predicted: Family / Partner)',
    isPrimaryUser: false,
    predictedRole: 'Household Member',
    referencePitchHz: 224,
    referenceCentroidHz: 2450,
  },
  {
    speakerId: 'spk_guest_remote',
    speakerLabel: 'Voice D (Predicted: Remote Caller)',
    isPrimaryUser: false,
    predictedRole: 'External Meeting Participant',
    referencePitchHz: 108,
    referenceCentroidHz: 1380,
  },
];

export function predictSpeakerFromAcousticsAndText(
  acoustics: AcousticFeatures,
  text: string,
  profiles: KnownVoiceProfile[] = DEFAULT_VOICE_PROFILES
): SpeakerPrediction {
  let bestProfile = profiles[0];
  let minDistance = Number.POSITIVE_INFINITY;

  for (const profile of profiles) {
    const pitchDiff = Math.abs(acoustics.pitchHz - profile.referencePitchHz) / 100;
    const centroidDiff = Math.abs(acoustics.spectralCentroidHz - profile.referenceCentroidHz) / 1000;
    const dist = pitchDiff * 0.75 + centroidDiff * 0.25;
    if (dist < minDistance) {
      minDistance = dist;
      bestProfile = profile;
    }
  }

  // Calculate voiceprint similarity (0 to 1)
  const rawSimilarity = Math.max(0.55, Math.min(0.99, Number((1 - minDistance * 0.45).toFixed(2))));

  // Determine vocal range
  let vocalRange: SpeakerPrediction['vocalCharacteristics']['vocalRange'] = 'mid_tenor';
  if (acoustics.pitchHz < 120) {
    vocalRange = 'low_baritone';
  } else if (acoustics.pitchHz < 165) {
    vocalRange = 'mid_tenor';
  } else if (acoustics.pitchHz < 210) {
    vocalRange = 'alto_mezzo';
  } else {
    vocalRange = 'soprano_high';
  }

  // Refine predicted role for other voices using contextual cues if non-primary
  let predictedRole = bestProfile.predictedRole;
  if (!bestProfile.isPrimaryUser) {
    const lower = text.toLowerCase();
    if (/\b(api|deploy|schema|pull request|sprint|architecture|sqlite|code)\b/.test(lower)) {
      predictedRole = 'Engineering Peer / Collaborator';
    } else if (/\b(dinner|groceries|weekend|kids|home|evening|family)\b/.test(lower)) {
      predictedRole = 'Household / Family Member';
    } else if (/\b(roadmap|invoice|contract|client|stakeholder|quarterly)\b/.test(lower)) {
      predictedRole = 'Client / Product Stakeholder';
    }
  }

  return {
    speakerId: bestProfile.speakerId,
    speakerLabel: bestProfile.speakerLabel,
    isPrimaryUser: bestProfile.isPrimaryUser,
    confidence: rawSimilarity,
    predictedRole,
    vocalCharacteristics: {
      pitchHz: Math.round(acoustics.pitchHz),
      vocalRange,
      voiceprintSimilarity: rawSimilarity,
    },
  };
}

export interface SpeechAnalysisResult {
  cleanText: string;
  totalWords: number;
  uniqueWords: string[];
  uniqueWordCount: number;
  wpm: number;
  durationSeconds: number;
  tokens: WordToken[];
  wordFrequencies: Record<string, number>;
  fillerCounts: Record<string, number>;
  totalFillerCount: number;
  fillerPercentage: number;
  fillerOccurrences: FillerOccurrence[];
  detectedTopic: string;
  secondaryTopics: string[];
  extractedDecisions: string[];
  extractedCommitments: string[];
  extractedQuestions: string[];
  vocabularyDiversityScore: number; // Type-Token Ratio (0 - 100)
  speakerPrediction?: SpeakerPrediction;
}

export const COMMON_STOP_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
  'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
  'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
  'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
  'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
  'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
  'into', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than',
  'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also',
  'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well',
  'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day',
  'most', 'us', 'is', 'are', 'was', 'were', 'been', 'has', 'had', 'did',
  'am', 'very', 'much', 'more', 'really', 'still', 'here', 'from'
]);

export const SINGLE_WORD_FILLERS: Record<string, 'hesitation' | 'hedging' | 'discourse_marker' | 'qualifier'> = {
  'um': 'hesitation',
  'uh': 'hesitation',
  'erm': 'hesitation',
  'er': 'hesitation',
  'hmm': 'hesitation',
  'like': 'discourse_marker',
  'actually': 'qualifier',
  'basically': 'qualifier',
  'literally': 'qualifier',
  'honestly': 'qualifier',
  'frankly': 'qualifier',
  'essentially': 'qualifier',
  'obviously': 'qualifier',
  'right': 'discourse_marker',
  'anyway': 'discourse_marker',
};

export const MULTI_WORD_FILLERS: Array<{
  phrase: string;
  words: string[];
  category: 'hesitation' | 'hedging' | 'discourse_marker' | 'qualifier';
}> = [
  { phrase: 'you know', words: ['you', 'know'], category: 'discourse_marker' },
  { phrase: 'i mean', words: ['i', 'mean'], category: 'hedging' },
  { phrase: 'sort of', words: ['sort', 'of'], category: 'hedging' },
  { phrase: 'kind of', words: ['kind', 'of'], category: 'hedging' },
  { phrase: 'to be honest', words: ['to', 'be', 'honest'], category: 'qualifier' },
];

export const TOPIC_KEYWORDS: Record<string, string[]> = {
  'Software Engineering': [
    'code', 'api', 'backend', 'frontend', 'database', 'sqlite', 'python', 'fastapi',
    'typescript', 'react', 'deploy', 'docker', 'architecture', 'migration', 'test',
    'bug', 'latency', 'websocket', 'schema', 'refactor', 'commit', 'repository', 'git',
    'microservice', 'endpoint', 'query', 'index', 'worker', 'async', 'component'
  ],
  'Technology & IoT': [
    'raspberry', 'pi', 'microphone', 'usb', 'sensor', 'hardware', 'arm64', 'linux',
    'whisper', 'silero', 'vad', 'model', 'ollama', 'gemini', 'neural', 'inference',
    'systemd', 'cpu', 'memory', 'ram', 'edge', 'audio', 'transcription', 'device'
  ],
  'Work & Strategy': [
    'meeting', 'deadline', 'project', 'client', 'roadmap', 'quarterly', 'milestone',
    'stakeholder', 'sprint', 'deliverable', 'team', 'review', 'presentation', 'launch',
    'priority', 'schedule', 'objective', 'strategy', 'sync', 'planning'
  ],
  'Finance': [
    'budget', 'cost', 'expense', 'revenue', 'investment', 'invoice', 'tax',
    'savings', 'subscription', 'pricing', 'financial', 'quarterly', 'account', 'margin'
  ],
  'Health & Fitness': [
    'workout', 'run', 'running', 'sleep', 'cardio', 'hydrate', 'nutrition',
    'calories', 'gym', 'recovery', 'morning', 'walk', 'stretch', 'posture', 'energy'
  ],
  'Learning & Research': [
    'book', 'paper', 'course', 'study', 'algorithm', 'concept', 'lecture',
    'reading', 'documentation', 'tutorial', 'experiment', 'hypothesis', 'understand'
  ],
  'Personal Life & Family': [
    'family', 'dinner', 'weekend', 'home', 'groceries', 'call', 'parents',
    'evening', 'coffee', 'friend', 'vacation', 'trip', 'cooking', 'relax'
  ],
  'Travel': [
    'flight', 'hotel', 'airport', 'train', 'itinerary', 'passport', 'packing',
    'conference', 'destination', 'booking'
  ]
};

function inferTriggerContext(surroundingLower: string): FillerOccurrence['triggerContext'] {
  if (/\b(api|code|database|sqlite|whisper|architecture|latency|server|system|deploy|model|docker|index|timestamps|schema)\b/.test(surroundingLower)) {
    return 'technical_explanation';
  }
  if (/\b(will|need to|going to|plan|schedule|tomorrow|next week|deadline|should|commit)\b/.test(surroundingLower)) {
    return 'planning_commitment';
  }
  if (/\b(maybe|perhaps|think|not sure|probably|might|guess|wonder|estimate)\b/.test(surroundingLower)) {
    return 'uncertainty_hedging';
  }
  if (/\b(moving on|another thing|also|switching|regarding|next topic|anyway)\b/.test(surroundingLower)) {
    return 'topic_transition';
  }
  return 'general_discourse';
}

export function detectTopicsFromText(text: string): { primary: string; secondary: string[] } {
  const lower = text.toLowerCase();
  const scores: Array<{ topic: string; score: number }> = [];

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      const regex = new RegExp(`\\b${kw}\\b`, 'gi');
      const matches = lower.match(regex);
      if (matches) {
        score += matches.length;
      }
    }
    if (score > 0) {
      scores.push({ topic, score });
    }
  }

  scores.sort((a, b) => b.score - a.score);
  if (scores.length === 0) {
    return { primary: 'General Reflection', secondary: [] };
  }

  return {
    primary: scores[0].topic,
    secondary: scores.slice(1, 3).map((s) => s.topic),
  };
}

export function extractInsightsFromText(text: string): {
  decisions: string[];
  commitments: string[];
  questions: string[];
} {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const decisions: string[] = [];
  const commitments: string[] = [];
  const questions: string[] = [];

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (sentence.endsWith('?') || /^(what|how|why|when|where|who|should we|can we|is there)\b/i.test(sentence)) {
      questions.push(sentence);
    }
    if (/\b(decided to|we chose|going with|finalized|agreed on|settled on|switching to)\b/.test(lower)) {
      decisions.push(sentence);
    }
    if (/\b(i need to|i will|i'll|we must|todo|remember to|make sure to|scheduled for|plan to)\b/.test(lower)) {
      commitments.push(sentence);
    }
  }

  return { decisions, commitments, questions };
}

export function analyzeSpeechSegment(
  rawText: string,
  durationSeconds: number,
  acoustics?: AcousticFeatures
): SpeechAnalysisResult {
  const cleanText = rawText.trim().replace(/\s+/g, ' ');
  const safeDuration = Math.max(durationSeconds, 1);

  if (!cleanText) {
    return {
      cleanText: '',
      totalWords: 0,
      uniqueWords: [],
      uniqueWordCount: 0,
      wpm: 0,
      durationSeconds: safeDuration,
      tokens: [],
      wordFrequencies: {},
      fillerCounts: {},
      totalFillerCount: 0,
      fillerPercentage: 0,
      fillerOccurrences: [],
      detectedTopic: 'General Reflection',
      secondaryTopics: [],
      extractedDecisions: [],
      extractedCommitments: [],
      extractedQuestions: [],
      vocabularyDiversityScore: 0,
    };
  }

  // Extract raw word tokens preserving punctuation boundaries for sentence start calculation
  const rawWords = cleanText.split(' ');
  const normalizedWords: string[] = [];
  const cleanWords: string[] = [];

  for (const rw of rawWords) {
    const stripped = rw.replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, '');
    if (stripped.length > 0) {
      cleanWords.push(rw);
      normalizedWords.push(stripped.toLowerCase());
    }
  }

  const totalWords = normalizedWords.length;
  const msPerWord = (safeDuration * 1000) / Math.max(totalWords, 1);

  const fillerCounts: Record<string, number> = {};
  const fillerOccurrences: FillerOccurrence[] = [];
  const consumedIndices = new Set<number>();
  const tokenFillerMeta = new Map<number, { category: FillerOccurrence['category']; phrase: string }>();

  // 1. Check multi-word filler phrases first
  for (let i = 0; i < normalizedWords.length; i++) {
    for (const mw of MULTI_WORD_FILLERS) {
      if (i + mw.words.length <= normalizedWords.length) {
        let match = true;
        for (let k = 0; k < mw.words.length; k++) {
          if (normalizedWords[i + k] !== mw.words[k]) {
            match = false;
            break;
          }
        }
        if (match) {
          for (let k = 0; k < mw.words.length; k++) {
            consumedIndices.add(i + k);
            tokenFillerMeta.set(i + k, { category: mw.category, phrase: mw.phrase });
          }
          fillerCounts[mw.phrase] = (fillerCounts[mw.phrase] || 0) + 1;

          const startWindow = Math.max(0, i - 5);
          const endWindow = Math.min(cleanWords.length, i + mw.words.length + 5);
          const snippet = cleanWords.slice(startWindow, endWindow).join(' ');
          const prevRaw = i > 0 ? cleanWords[i - 1] : '';
          const isSentenceStart = i === 0 || /[.!?]$/.test(prevRaw);
          const isClauseEnd = /[,.;!?]$/.test(cleanWords[i + mw.words.length - 1]);

          fillerOccurrences.push({
            fillerPhrase: mw.phrase,
            category: mw.category,
            position: isSentenceStart ? 'sentence_start' : isClauseEnd ? 'clause_end' : 'mid_clause_transition',
            triggerContext: inferTriggerContext(snippet.toLowerCase()),
            snippet,
            wordIndex: i,
          });
          break;
        }
      }
    }
  }

  // 2. Check single-word fillers
  for (let i = 0; i < normalizedWords.length; i++) {
    if (consumedIndices.has(i)) continue;
    const norm = normalizedWords[i];
    const category = SINGLE_WORD_FILLERS[norm];

    if (category) {
      let isFillerInstance = true;
      if (norm === 'like' && i > 0) {
        const prev = normalizedWords[i - 1];
        if (['would', 'i', 'we', 'they', 'you', 'dont', "don't", 'really', 'looks', 'feels', 'sounds'].includes(prev)) {
          const rawCurrent = cleanWords[i];
          const nextNorm = i + 1 < normalizedWords.length ? normalizedWords[i + 1] : '';
          if (!rawCurrent.endsWith(',') && !['um', 'uh', 'a', 'the', 'ten', 'five', 'two', 'hundred'].includes(nextNorm)) {
            isFillerInstance = false;
          }
        }
      }

      if (isFillerInstance) {
        tokenFillerMeta.set(i, { category, phrase: norm });
        fillerCounts[norm] = (fillerCounts[norm] || 0) + 1;

        const startWindow = Math.max(0, i - 5);
        const endWindow = Math.min(cleanWords.length, i + 6);
        const snippet = cleanWords.slice(startWindow, endWindow).join(' ');
        const prevRaw = i > 0 ? cleanWords[i - 1] : '';
        const isSentenceStart = i === 0 || /[.!?]$/.test(prevRaw);
        const isClauseEnd = /[,.;!?]$/.test(cleanWords[i]);

        fillerOccurrences.push({
          fillerPhrase: norm,
          category,
          position: isSentenceStart ? 'sentence_start' : isClauseEnd ? 'clause_end' : 'mid_clause_transition',
          triggerContext: inferTriggerContext(snippet.toLowerCase()),
          snippet,
          wordIndex: i,
        });
      }
    }
  }

  // Build tokens and word frequencies
  const tokens: WordToken[] = [];
  const wordFrequencies: Record<string, number> = {};
  const uniqueSet = new Set<string>();

  for (let i = 0; i < normalizedWords.length; i++) {
    const norm = normalizedWords[i];
    uniqueSet.add(norm);
    wordFrequencies[norm] = (wordFrequencies[norm] || 0) + 1;

    const fillerMeta = tokenFillerMeta.get(i);
    tokens.push({
      word: cleanWords[i],
      normalized: norm,
      index: i,
      isFiller: Boolean(fillerMeta),
      fillerCategory: fillerMeta?.category,
      startOffsetMs: Math.round(i * msPerWord),
      endOffsetMs: Math.round((i + 1) * msPerWord),
    });
  }

  const totalFillerCount = Object.values(fillerCounts).reduce((acc, c) => acc + c, 0);
  const fillerPercentage = totalWords > 0 ? Number(((totalFillerCount / totalWords) * 100).toFixed(2)) : 0;
  const wpm = totalWords > 0 ? Math.round((totalWords / safeDuration) * 60) : 0;
  const uniqueWords = Array.from(uniqueSet);
  const vocabularyDiversityScore = totalWords > 0 ? Math.round((uniqueWords.length / totalWords) * 100) : 0;

  const topics = detectTopicsFromText(cleanText);
  const insights = extractInsightsFromText(cleanText);
  const speakerPrediction = acoustics
    ? predictSpeakerFromAcousticsAndText(acoustics, cleanText)
    : predictSpeakerFromAcousticsAndText({ pitchHz: 132, energyRms: 0.45, spectralCentroidHz: 1650 }, cleanText);

  return {
    cleanText,
    totalWords,
    uniqueWords,
    uniqueWordCount: uniqueWords.length,
    wpm,
    durationSeconds: safeDuration,
    tokens,
    wordFrequencies,
    fillerCounts,
    totalFillerCount,
    fillerPercentage,
    fillerOccurrences,
    detectedTopic: topics.primary,
    secondaryTopics: topics.secondary,
    extractedDecisions: insights.decisions,
    extractedCommitments: insights.commitments,
    extractedQuestions: insights.questions,
    vocabularyDiversityScore,
    speakerPrediction,
  };
}
