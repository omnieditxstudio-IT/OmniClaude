import { PersonaConfig, MultilingualSupport } from './persona.types';
import { getPersonaConfig } from './persona.service';

export interface LanguageDetectionResult {
  language: string;
  confidence: number;
  supported: boolean;
}

export interface MultilingualEnforcementOptions {
  autoDetect?: boolean;
  enforceConsistency?: boolean;
  fallbackLanguage?: string;
}

export class MultilingualPersonaService {
  private supportedLanguages = [
    'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh',
    'ar', 'hi', 'bn', 'pa', 'jv', 'de', 'tr', 'vi', 'th', 'id'
  ];

  private languagePatterns: Record<string, RegExp[]> = {
    'en': [/\b(the|is|at|which|on|and|a|an|in|to|be|of|for|not|with)\b/gi],
    'es': [/\b(el|la|los|las|de|en|que|por|con|para|una|un|y|no|se|es|lo|su|al)\b/gi],
    'fr': [/\b(le|la|les|de|du|des|un|une|et|en|est|que|pas|pour|avec|ne|se|son|sa|au)\b/gi],
    'de': [/\b(der|die|das|und|ist|von|mit|für|auf|ein|eine|als|auch|es|an|werden|aus)\b/gi],
    'it': [/\b(il|la|di|che|è|in|un|una|per|con|non|da|si|lo|gli|le|ne|più|come)\b/gi],
    'pt': [/\b(o|a|os|as|de|em|que|para|com|não|uma|um|no|na|por|mais|como|seu)\b/gi],
    'ru': [/\b(и|в|не|на|я|что|он|с|как|это|но|его|к|у|же|вы|за|бы|по)\b/gi],
    'ja': [/\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Han}/gu],
    'ko': [/\p{Script=Hangul}/gu],
    'zh': [/\p{Script=Han}/gu],
    'ar': [/\p{Script=Arabic}/gu],
    'hi': [/\p{Script=Devanagari}/gu],
  };

  detectLanguage(text: string): LanguageDetectionResult {
    const scores: Record<string, number> = {};
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

    for (const [lang, patterns] of Object.entries(this.languagePatterns)) {
      let matches = 0;
      for (const pattern of patterns) {
        const found = text.match(pattern);
        if (found) matches += found.length;
      }
      scores[lang] = matches / Math.max(wordCount, 1);
    }

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const best = sorted[0];

    return {
      language: best?.[1] && best[1] > 0.1 ? best[0] : 'en',
      confidence: best?.[1] || 0,
      supported: this.supportedLanguages.includes(best?.[0] || 'en'),
    };
  }

  enforceMultilingual(
    request: any,
    provider: string,
    modelId: string,
    options: MultilingualEnforcementOptions = {}
  ): any {
    const persona = getPersonaConfig(provider, modelId);
    const multilingual = persona.multilingual;

    if (!multilingual?.enabled) {
      return request;
    }

    const userMessage = request.messages?.[request.messages.length - 1]?.content || '';
    const detected = this.detectLanguage(typeof userMessage === 'string' ? userMessage : JSON.stringify(userMessage));
    const autoDetect = options.autoDetect ?? multilingual.autoDetectLanguage;
    const enforceConsistency = options.enforceConsistency ?? multilingual.enforceLanguageConsistency;

    // Apply language-specific overrides if available
    let enforcedRequest = { ...request };
    const langCode = detected.language;

    if (multilingual.languageOverrides?.[langCode]) {
      const override = multilingual.languageOverrides[langCode];
      if (override.systemPrompt && request.system) {
        const currentSystem = typeof request.system === 'string' ? request.system : '';
        enforcedRequest = {
          ...enforcedRequest,
          system: `${currentSystem}\n\n[LANGUAGE OVERRIDE: ${langCode}]\n${override.systemPrompt}`,
        };
      }
    }

    // Add language consistency instruction
    if (enforceConsistency) {
      const systemPrompt = typeof enforcedRequest.system === 'string' ? enforcedRequest.system : '';
      const langInstruction = `\n\nIMPORTANT: The user is communicating in ${langCode}. You must respond in the same language (${langCode}). Maintain language consistency throughout the conversation.`;
      enforcedRequest = {
        ...enforcedRequest,
        system: systemPrompt + langInstruction,
      };
    }

    return enforcedRequest;
  }

  getSupportedLanguages(): string[] {
    return [...this.supportedLanguages];
  }

  isLanguageSupported(languageCode: string): boolean {
    return this.supportedLanguages.includes(languageCode.toLowerCase());
  }

  getLanguageName(languageCode: string): string {
    const names: Record<string, string> = {
      'en': 'English', 'es': 'Spanish', 'fr': 'French', 'de': 'German',
      'it': 'Italian', 'pt': 'Portuguese', 'ru': 'Russian', 'ja': 'Japanese',
      'ko': 'Korean', 'zh': 'Chinese', 'ar': 'Arabic', 'hi': 'Hindi',
    };
    return names[languageCode.toLowerCase()] || languageCode;
  }

  buildLanguagePrompt(persona: PersonaConfig): string {
    if (!persona.multilingual?.enabled) {
      return '';
    }

    const multilingual = persona.multilingual;
    let prompt = '\n\n--- MULTILINGUAL SUPPORT ---\n';

    if (multilingual.supportedLanguages.length > 0) {
      prompt += `Supported languages: ${multilingual.supportedLanguages.map(l => this.getLanguageName(l)).join(', ')}.\n`;
    }

    if (multilingual.autoDetectLanguage) {
      prompt += 'You must automatically detect the user\'s language and respond in that language.\n';
    }

    if (multilingual.enforceLanguageConsistency) {
      prompt += 'CRITICAL: You must maintain language consistency. If the user writes in a specific language, continue in that language for the entire conversation.\n';
    }

    if (multilingual.languageOverrides) {
      prompt += 'Language-specific instructions:\n';
      for (const [lang, override] of Object.entries(multilingual.languageOverrides)) {
        prompt += `- ${this.getLanguageName(lang)}: ${override.systemPrompt || 'No specific instructions'}\n`;
      }
    }

    return prompt;
  }
}

export const multilingualPersonaService = new MultilingualPersonaService();
