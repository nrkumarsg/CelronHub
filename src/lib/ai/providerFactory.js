import { getProviders, saveProviders, getEncryptedApiKey, getDecryptedApiKey } from './configService.js';
import { executeGeminiRequest, executeClaudeRequest, executeOpenAICompatibleRequest, executeProviderRequest } from './providerRunners.js';
import { callServerAiProxy } from './serverProxyClient.js';

/**
 * AIProviderFactory - Unified Multi-Provider API Switcher & Factory Pattern
 * Supports Gemini Vision (AI Studio), Ollama (Local Vision), DeepSeek, Groq, Claude, OpenAI.
 */
export class AIProviderFactory {
  static getAvailableProviders() {
    return getProviders();
  }

  static getProviderByName(name) {
    const list = getProviders();
    return list.find(p => p.name.toLowerCase() === name.toLowerCase()) || list[0];
  }

  /**
   * Execute an AI task against a specific provider or fall back dynamically.
   */
  static async execute({
    providerName = null,
    prompt,
    history = [],
    useJson = true,
    image = null,
    images = null,
    signal = null
  }) {
    const targetProvider = providerName ? this.getProviderByName(providerName) : null;
    const providerList = targetProvider ? [targetProvider] : getProviders().filter(p => p.enabled);

    if (providerList.length === 0) {
      throw new Error('No enabled AI providers found. Check AI Settings.');
    }

    const errors = [];
    const imagePayloads = Array.isArray(images) && images.length > 0 ? images : (image ? [image] : []);

    for (const provider of providerList) {
      const hasCustomKey = Boolean(getEncryptedApiKey(provider.name));
      const decryptedKey = hasCustomKey ? await getDecryptedApiKey(provider.name) : null;
      const timeoutMs = provider.timeout || 20000;

      // Vision capability guard check
      const isVisionRequest = imagePayloads.length > 0;
      const supportsVision = ['Gemini', 'OpenAI', 'Claude', 'Ollama', 'OpenRouter'].includes(provider.name);

      if (isVisionRequest && !supportsVision) {
        console.warn(`[AIProviderFactory] Provider "${provider.name}" does not support multi-image payloads. Skipping.`);
        continue;
      }

      try {
        console.log(`[AIProviderFactory] Routing request via ${provider.name} (${provider.modelName})...`);

        if (provider.name === 'Ollama' || hasCustomKey) {
          if (provider.name === 'Gemini') {
            return await executeGeminiRequest(provider, decryptedKey, prompt, history, useJson, null, signal, imagePayloads);
          } else if (provider.name === 'Claude') {
            return await executeClaudeRequest(provider, decryptedKey, prompt, history, useJson, null, signal, imagePayloads);
          } else {
            return await executeOpenAICompatibleRequest(provider, decryptedKey, prompt, history, useJson, null, signal, imagePayloads);
          }
        } else {
          // Route through backend proxy for operator keys
          return await callServerAiProxy(provider.name.toLowerCase(), prompt, history, useJson, imagePayloads[0] || null, provider.modelName, imagePayloads);
        }
      } catch (err) {
        console.warn(`[AIProviderFactory] Provider "${provider.name}" failed: ${err.message}`);
        errors.push(`${provider.name}: ${err.message}`);
      }
    }

    throw new Error(`AI Provider execution failed:\n${errors.join('\n')}`);
  }

  /**
   * Dedicated Business Card Front & Back Visual Verification and Extraction Engine
   */
  static async processCardPair({ frontImage, backImage, providerName = 'Gemini' }) {
    const prompt = `
You are the AI Business Card Pairing & Schema Extraction Engine of CELRONHUB.
You are given TWO business card images for visual verification and extraction.

Candidate 1 (Front Side): Main contact person, company name, designation, email, phone number, address.
Candidate 2 (Back Side): Products, services, brand logos, additional offices, extra details.

### TASK:
1. Verify if Candidate 1 (Front) and Candidate 2 (Back) belong to the SAME company/person entity.
2. Extract all contact and company details from BOTH images into a unified, clean JSON object.

### JSON SCHEMA:
{
  "entity_match": true,
  "confidence_score": 0.95,
  "company_name": "Full official company name",
  "uen": "Singapore UEN or registration number if present",
  "address": "Full physical address",
  "city": "City name",
  "country": "Country (default Singapore)",
  "postal_code": "Postal code",
  "website": "Official website URL (default www.celron.net if empty)",
  "email": "Company email address",
  "phone": "Main landline phone",
  "brands": "Brand names or agency representations found",
  "business_scope": "Detailed summary of products, services, or equipment listed on back/front of card",
  "notes": "Any extra details, social media handles, or secondary offices",
  "contact": {
    "name": "Full name of contact person",
    "designation": "Job title or post",
    "department": "Department (e.g. Sales, Management, Engineering)",
    "email": "Direct personal/business email",
    "handphone": "Mobile/Handphone number",
    "direct_line": "Direct telephone line"
  }
}

Return ONLY valid JSON. No prose, no markdown fences.
`;

    const images = [frontImage, backImage].filter(Boolean);
    return await this.execute({
      providerName,
      prompt,
      images,
      useJson: true
    });
  }
}
