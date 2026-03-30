/**
 * @fileoverview Unified AI Client.
 *
 * Abstracts the AI provider (OpenAI, Google Gemini, Groq) behind a single
 * interface. The active provider is controlled by environment variables.
 *
 * Supported providers:
 *   - openai  → Uses OpenAI SDK (gpt-4o, gpt-4o-mini, etc.)
 *   - google  → Uses Google Generative AI SDK (gemini-2.0-flash, gemini-pro, etc.)
 *   - groq    → Uses OpenAI SDK with Groq base URL (llama, mixtral, etc.)
 *
 * Usage:
 *   const { createAIClient } = require('./ai-client');
 *   const client = createAIClient('selector');  // or 'flow'
 *   const response = await client.chat(systemPrompt, userPrompt);
 */

const frameworkConfig = require('../../config/framework.config');

// ═══════════════════════════════════════════════════════════════════════════
//  PROVIDER IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * OpenAI provider (also used for Groq via baseURL override).
 */
class OpenAIProvider {
  constructor({ apiKey, baseURL, model, maxTokens, timeoutMs }) {
    const OpenAI = require('openai');
    const opts = {
      apiKey,
      timeout: timeoutMs,
    };
    if (baseURL) opts.baseURL = baseURL;
    this.client = new OpenAI(opts);
    this.model = model;
    this.maxTokens = maxTokens;
    this.providerName = baseURL?.includes('groq') ? 'groq' : 'openai';
  }

  async chat(systemPrompt, userPrompt) {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    return {
      content: completion.choices[0]?.message?.content || '',
      tokensUsed: completion.usage?.total_tokens || 0,
      provider: this.providerName,
      model: this.model,
    };
  }
}

/**
 * Google Gemini provider.
 */
class GoogleProvider {
  constructor({ apiKey, model, maxTokens }) {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.modelName = model;
    this.maxTokens = maxTokens;

    this.generativeModel = this.genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: this.maxTokens,
        responseMimeType: 'application/json',
      },
    });
  }

  async chat(systemPrompt, userPrompt, _attempt = 0) {
    const MAX_RETRIES = 3;
    try {
      const chat = this.generativeModel.startChat({
        history: [
          {
            role: 'user',
            parts: [{ text: systemPrompt }],
          },
          {
            role: 'model',
            parts: [{ text: 'Understood. I will follow these instructions and respond only with valid JSON.' }],
          },
        ],
      });

      const result = await chat.sendMessage(userPrompt);
      const response = result.response;
      const text = response.text();

      return {
        content: text,
        tokensUsed: response.usageMetadata?.totalTokenCount || 0,
        provider: 'google',
        model: this.modelName,
      };
    } catch (err) {
      const is429 = err.message && err.message.includes('429');
      if (is429 && _attempt < MAX_RETRIES) {
        // Parse retry-after delay from error message (e.g. "Please retry in 48s")
        const delayMatch = err.message.match(/retry in (\d+)/i);
        const delaySec = delayMatch ? parseInt(delayMatch[1], 10) + 5 : 65;
        console.warn(`[GoogleProvider] Rate limited (429). Retrying after ${delaySec}s (attempt ${_attempt + 1}/${MAX_RETRIES})...`);
        await new Promise(r => setTimeout(r, delaySec * 1000));
        return this.chat(systemPrompt, userPrompt, _attempt + 1);
      }
      throw err;
    }
  }
}

/**
 * Mock provider for reliable demos when API keys are exhausted.
 */
class MockProvider {
  constructor() {
    this.providerName = 'mock';
    this.model = 'mock-reasoning-engine';
  }

  async chat(systemPrompt, userPrompt) {
    console.log('[MockProvider] Intercepting request for reliable healing demo...');

    // Hardcoded responses for known broken selectors in the demo suite
    const responses = {
      '#user-login-email-field-v2': {
        candidates: [
          { selector: 'input[type="email"]', confidence: 0.98, strategy: 'attribute_match', rationale: 'Found identical email input field' },
          { selector: 'page.getByLabel("Email address")', confidence: 0.95, strategy: 'accessibility', rationale: 'Matched via aria-label' }
        ],
        recommendedSelector: 'input[type="email"]',
        recommendedConfidence: 0.98
      },
      'button.custom-add-to-cart-action': {
        candidates: [
          { selector: 'button:has-text("Add to cart") >> nth=0', confidence: 0.99, strategy: 'text_match', rationale: 'Matched first "Add to cart" precisely' },
          { selector: 'page.getByRole("button", { name: "Add to cart" }).first()', confidence: 0.97, strategy: 'accessibility', rationale: 'Semantic button match' }
        ],
        recommendedSelector: 'button:has-text("Add to cart") >> nth=0',
        recommendedConfidence: 0.99
      },
      '[data-testid="email-input-v3"]': {
        recommendedSelector: 'input[type="email"]',
        recommendedConfidence: 0.98
      },
      '[data-testid="submit-login-btn"]': {
        recommendedSelector: 'button:has-text("Login")',
        recommendedConfidence: 0.98
      }
    };

    // Find a match in the user prompt
    let matchedResponse = null;
    for (const [key, value] of Object.entries(responses)) {
      if (userPrompt.includes(key)) {
        matchedResponse = value;
        break;
      }
    }

    if (matchedResponse) {
      return {
        content: JSON.stringify(matchedResponse),
        tokensUsed: 0,
        provider: 'mock',
        model: this.model,
      };
    }

    // Default fallback if no hardcoded match
    return {
      content: JSON.stringify({
        candidates: [],
        recommendedSelector: null,
        recommendedConfidence: 0,
        error: 'No mock response for this selector. Please provide a real API key.'
      }),
      tokensUsed: 0,
      provider: 'mock',
      model: this.model,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create an AI client for the specified agent type.
 *
 * @param {'selector'|'flow'} agentType – determines which model config to use
 * @returns {{ chat: (systemPrompt: string, userPrompt: string) => Promise<Object> }}
 */
function createAIClient(agentType) {
  const provider = frameworkConfig.ai.provider;
  const maxTokens = frameworkConfig.ai.maxTokens;
  const timeoutMs = frameworkConfig.ai.requestTimeoutMs;

  // Pick the model for this agent type
  const model = agentType === 'flow'
    ? frameworkConfig.ai.flowModel
    : frameworkConfig.ai.selectorModel;

  switch (provider) {
    case 'mock': {
      console.log(`[AIClient] Using Mock Provider (Offline Mode)`);
      return new MockProvider();
    }

    case 'google': {
      const apiKey = frameworkConfig.ai.google.apiKey;
      if (!apiKey) throw new Error('GOOGLE_API_KEY is required when AI_PROVIDER=google');
      console.log(`[AIClient] Using Google Gemini (${model})`);
      return new GoogleProvider({ apiKey, model, maxTokens });
    }

    case 'groq': {
      const apiKey = frameworkConfig.ai.groq.apiKey;
      if (!apiKey) throw new Error('GROQ_API_KEY is required when AI_PROVIDER=groq');
      console.log(`[AIClient] Using Groq (${model})`);
      return new OpenAIProvider({
        apiKey,
        baseURL: 'https://api.groq.com/openai/v1',
        model,
        maxTokens,
        timeoutMs,
      });
    }

    case 'openai':
    default: {
      const apiKey = frameworkConfig.ai.openai.apiKey;
      if (!apiKey) throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai');
      console.log(`[AIClient] Using OpenAI (${model})`);
      return new OpenAIProvider({
        apiKey,
        model,
        maxTokens,
        timeoutMs,
      });
    }
  }
}

module.exports = { createAIClient };
