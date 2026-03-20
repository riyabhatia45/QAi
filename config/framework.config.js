/**
 * @fileoverview Framework-wide configuration.
 *
 * Values can be overridden via environment variables.
 * See design doc § 15 – CI/CD Integration Model for mode details.
 *
 * AI Provider support:
 *   AI_PROVIDER=openai  → Uses OpenAI SDK (default)
 *   AI_PROVIDER=google  → Uses Google Generative AI SDK
 *   AI_PROVIDER=groq    → Uses OpenAI SDK with Groq base URL
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const frameworkConfig = {
  // ─── AI Provider ──────────────────────────────────────────────────────
  ai: {
    /** 'openai' | 'google' | 'groq' – which AI provider to use */
    provider: process.env.AI_PROVIDER || 'openai',

    /** Model for selector recovery (lower-cost, faster) */
    selectorModel: process.env.AI_SELECTOR_MODEL
      || (process.env.AI_PROVIDER === 'google' ? 'gemini-2.0-flash' :
         process.env.AI_PROVIDER === 'groq' ? 'llama-3.3-70b-versatile' :
         'gpt-4o-mini'),

    /** Model for flow recovery (stronger reasoning) */
    flowModel: process.env.AI_FLOW_MODEL
      || (process.env.AI_PROVIDER === 'google' ? 'gemini-2.0-flash' :
         process.env.AI_PROVIDER === 'groq' ? 'llama-3.3-70b-versatile' :
         'gpt-4o'),

    /** Max tokens per request */
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '2048', 10),
    /** Timeout in ms */
    requestTimeoutMs: parseInt(process.env.AI_TIMEOUT_MS || '30000', 10),

    // ── Provider-specific credentials ──────────────────────────────────
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
    },
    google: {
      apiKey: process.env.GOOGLE_API_KEY || '',
    },
    groq: {
      apiKey: process.env.GROQ_API_KEY || '',
    },
  },

  // ─── Legacy aliases (backward-compatible) ─────────────────────────────
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    selectorModel: process.env.AI_SELECTOR_MODEL || process.env.OPENAI_SELECTOR_MODEL || 'gpt-4o-mini',
    flowModel: process.env.AI_FLOW_MODEL || process.env.OPENAI_FLOW_MODEL || 'gpt-4o',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || process.env.OPENAI_MAX_TOKENS || '2048', 10),
    requestTimeoutMs: parseInt(process.env.AI_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS || '30000', 10),
  },

  // ─── Execution ────────────────────────────────────────────────────────
  execution: {
    /** 'strict' | 'adaptive' – controls healing policies */
    mode: process.env.HEAL_MODE || 'adaptive',
    /** Deterministic retries before involving agent */
    maxDeterministicRetries: parseInt(process.env.MAX_DETERMINISTIC_RETRIES || '2', 10),
    /** Default action timeout in ms (Playwright level) */
    actionTimeoutMs: parseInt(process.env.ACTION_TIMEOUT_MS || '10000', 10),
  },

  // ─── Artifacts ────────────────────────────────────────────────────────
  artifacts: {
    /** Root directory for healing reports and screenshots */
    outputDir: process.env.ARTIFACTS_DIR || './test-results/healing-artifacts',
    /** Whether to capture screenshots before/after healing */
    captureScreenshots: process.env.CAPTURE_SCREENSHOTS !== 'false',
    /** Whether to capture Playwright traces */
    captureTraces: process.env.CAPTURE_TRACES !== 'false',
  },

  // ─── Memory ───────────────────────────────────────────────────────────
  memory: {
    /** File path for persistent selector memory */
    selectorStorePath: process.env.SELECTOR_STORE_PATH || './test-results/selector-memory.json',
    /** File path for persistent flow memory */
    flowStorePath: process.env.FLOW_STORE_PATH || './test-results/flow-memory.json',
    /** Decay factor applied to historical selector confidence per run */
    decayFactor: parseFloat(process.env.MEMORY_DECAY_FACTOR || '0.95'),
  },

  // ─── PII / Safety ────────────────────────────────────────────────────
  safety: {
    /** Sensitive attribute names to redact from DOM excerpts */
    redactAttributes: ['password', 'token', 'secret', 'ssn', 'credit-card', 'cc-number'],
    /** Max DOM characters to send to the model */
    maxDomExcerptLength: parseInt(process.env.MAX_DOM_EXCERPT || '4000', 10),
  },
};

module.exports = frameworkConfig;
