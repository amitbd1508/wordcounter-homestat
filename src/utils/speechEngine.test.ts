import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeSpeechSegment,
  detectTopicsFromText,
  extractInsightsFromText,
  predictSpeakerFromAcousticsAndText,
} from './speechEngine';

test('analyzeSpeechSegment accurately counts total words, WPM, and unique vocabulary', () => {
  const transcript = 'We deployed the FastAPI SQLite service to the Raspberry Pi four node today.';
  const result = analyzeSpeechSegment(transcript, 13); // 13 words in 13 seconds = 60 WPM
  assert.equal(result.totalWords, 13);
  assert.equal(result.wpm, 60);
  assert.equal(result.uniqueWordCount, 12);
  assert.equal(result.detectedTopic, 'Software Engineering');
});

test('analyzeSpeechSegment identifies single and multi-word filler words with trigger context', () => {
  const transcript = 'Um, I was thinking about the database schema, and you know, we basically need to index the UTC timestamps, sort of like a fast lookup.';
  const result = analyzeSpeechSegment(transcript, 25);

  assert.ok(result.totalFillerCount >= 4, 'Should detect um, you know, basically, sort of');
  assert.equal(result.fillerCounts['um'], 1);
  assert.equal(result.fillerCounts['you know'], 1);
  assert.equal(result.fillerCounts['basically'], 1);
  assert.equal(result.fillerCounts['sort of'], 1);

  const umOccurrence = result.fillerOccurrences.find((f) => f.fillerPhrase === 'um');
  assert.ok(umOccurrence);
  assert.equal(umOccurrence.position, 'sentence_start');
  assert.equal(umOccurrence.category, 'hesitation');

  const basicallyOccurrence = result.fillerOccurrences.find((f) => f.fillerPhrase === 'basically');
  assert.ok(basicallyOccurrence);
  assert.equal(basicallyOccurrence.triggerContext, 'technical_explanation');
});

test('extractInsightsFromText extracts decisions, commitments, and questions accurately', () => {
  const transcript = 'We decided to use SQLite with WAL mode for the local database. I need to configure the systemd service before Friday. How should we handle automatic backups on the SD card?';
  const insights = extractInsightsFromText(transcript);

  assert.equal(insights.decisions.length, 1);
  assert.equal(insights.commitments.length, 1);
  assert.equal(insights.questions.length, 1);
});

test('detectTopicsFromText classifies domain conversations properly', () => {
  const techText = 'The USB microphone connects to the Raspberry Pi running Silero VAD and faster-whisper inference.';
  const topicRes = detectTopicsFromText(techText);
  assert.equal(topicRes.primary, 'Technology & IoT');
});

test('predictSpeakerFromAcousticsAndText separates primary user voice from other voices and predicts role', () => {
  const myVoice = predictSpeakerFromAcousticsAndText(
    { pitchHz: 130, energyRms: 0.5, spectralCentroidHz: 1640 },
    'I am reviewing the local SQLite database migrations.'
  );
  assert.equal(myVoice.isPrimaryUser, true);
  assert.equal(myVoice.speakerId, 'spk_primary_owner');

  const otherColleagueVoice = predictSpeakerFromAcousticsAndText(
    { pitchHz: 180, energyRms: 0.48, spectralCentroidHz: 2120 },
    'Can we review the API pull request and architecture schema before deployment?'
  );
  assert.equal(otherColleagueVoice.isPrimaryUser, false);
  assert.equal(otherColleagueVoice.speakerId, 'spk_guest_colleague');
  assert.equal(otherColleagueVoice.predictedRole, 'Engineering Peer / Collaborator');

  const otherFamilyVoice = predictSpeakerFromAcousticsAndText(
    { pitchHz: 226, energyRms: 0.42, spectralCentroidHz: 2420 },
    'What time are we having dinner with the family this weekend?'
  );
  assert.equal(otherFamilyVoice.isPrimaryUser, false);
  assert.equal(otherFamilyVoice.speakerId, 'spk_guest_partner');
  assert.equal(otherFamilyVoice.predictedRole, 'Household / Family Member');
});
