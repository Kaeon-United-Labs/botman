require('dotenv').config();

const str = (k, d = '') => (process.env[k] === undefined || process.env[k] === '' ? d : process.env[k]);
const num = (k, d) => {
  const v = Number(str(k, String(d)));
  if (!Number.isFinite(v)) throw new Error(`Env ${k} must be a number`);
  return v;
};
const bool = (k, d) => ['1', 'true', 'yes', 'on'].includes(str(k, String(d)).toLowerCase());

const config = {
  port: num('PORT', 3000),
  mongoUri: str('MONGO_URI'),
  mongoDb: str('MONGO_DB', 'botman'),
  logName: str('LOG_NAME', 'orca-pool'),
  aiProvider: str('AI_PROVIDER', 'claude').toLowerCase(),
  aiKey: str('AI_API_KEY'),
  aiEndpoint: str('AI_ENDPOINT'),
  aiModel: str('AI_MODEL'),
  aiMaxTokens: num('AI_MAX_TOKENS', 1500),
  aiTimeoutMs: num('AI_TIMEOUT_MS', 60000),
  cycleIntervalMs: num('CYCLE_INTERVAL_MS', 8000),
  contextNotes: num('CONTEXT_NOTES', 60),
  maxNotesPerCycle: num('MAX_NOTES_PER_CYCLE', 3),
  maxUnansweredVisible: num('MAX_UNANSWERED_VISIBLE', 3),
  unansweredResetMs: num('UNANSWERED_RESET_MS', 600000),
  dedupeWindow: num('DEDUPE_WINDOW', 10),
  dedupeSimilarity: num('DEDUPE_SIMILARITY', 0.8),
  idleNudgeMs: num('IDLE_NUDGE_MS', 45000),
  requireFrontendPing: bool('REQUIRE_FRONTEND_PING', true),
  pingTimeoutMs: num('PING_TIMEOUT_MS', 15000),
  maxMessageChars: num('MAX_MESSAGE_CHARS', 2000),
  rateLimitPerMin: num('RATE_LIMIT_PER_MIN', 12),
  persona: str('BOTMAN_PERSONA', 'You are botman, a conversational companion.'),
};

function validate() {
  const errs = [];
  if (!config.mongoUri) errs.push('MONGO_URI is required');
  if (!['claude', 'gemini', 'mock'].includes(config.aiProvider)) errs.push('AI_PROVIDER must be claude, gemini, or mock');
  if (config.aiProvider !== 'mock' && !config.aiKey) errs.push('AI_API_KEY is required');
  if (config.aiProvider !== 'mock' && !config.aiModel) errs.push('AI_MODEL is required');
  if (errs.length) throw new Error('Bad configuration:\n - ' + errs.join('\n - '));
}

module.exports = { config, validate };
