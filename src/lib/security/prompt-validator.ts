// Prompt Validator — Detection of injection patterns and sanitization

const INJECTION_PATTERNS = [
  // Common injection patterns
  { pattern: /ignore\s+(previous|all|above)\s+(instructions?|prompts?)/i, risk: 'Tentative d\'ignorer les instructions' },
  { pattern: /forget\s+(everything|all|previous)/i, risk: 'Tentative d\'oubli du contexte' },
  { pattern: /you\s+are\s+now\s+a/i, risk: 'Tentative de changement de rôle' },
  { pattern: /pretend\s+(you\s+are|to\s+be)/i, risk: 'Tentative d\'usurpation d\'identité' },
  { pattern: /system\s*:\s*/i, risk: 'Tentative d\'injection système' },
  { pattern: /<\|im_start\|>/i, risk: 'Tentative d\'injection de balise' },
  { pattern: /```system/i, risk: 'Tentative d\'injection via bloc de code' },
  { pattern: /jailbreak/i, risk: 'Tentative de jailbreak' },
  { pattern: /DAN\s+mode/i, risk: 'Tentative d\'activation du mode DAN' },
  { pattern: /bypass\s+(safety|filter|restriction)/i, risk: 'Tentative de contournement de sécurité' },
  { pattern: /reveal\s+(your|the)\s+(prompt|instructions|system)/i, risk: 'Tentative de révélation du prompt système' },
  { pattern: /output\s+your\s+(initial|original|system)\s+prompt/i, risk: 'Tentative d\'extraction du prompt' },
];

const DANGEROUS_CODE_PATTERNS = [
  /eval\s*\(/i,
  /Function\s*\(/i,
  /require\s*\(/i,
  /import\s+/i,
  /process\./i,
  /child_process/i,
  /fs\./i,
  /fetch\s*\(/i,
  /XMLHttpRequest/i,
  /document\./i,
  /window\./i,
];

export interface ValidationResult {
  safe: boolean;
  risks: string[];
  sanitizedPrompt: string;
  threatLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

export class PromptValidator {
  /**
   * Validate a prompt for injection patterns
   */
  validatePrompt(prompt: string): ValidationResult {
    const risks: string[] = [];
    let threatLevel: ValidationResult['threatLevel'] = 'none';

    // Check for injection patterns
    for (const { pattern, risk } of INJECTION_PATTERNS) {
      if (pattern.test(prompt)) {
        risks.push(risk);
        threatLevel = 'high';
      }
    }

    // Check for dangerous code patterns in execution contexts
    for (const pattern of DANGEROUS_CODE_PATTERNS) {
      if (pattern.test(prompt)) {
        risks.push('Code potentiellement dangereux détecté');
        if (threatLevel === 'none') threatLevel = 'medium';
        break;
      }
    }

    // Check for extremely long prompts (potential DoS)
    if (prompt.length > 10000) {
      risks.push('Prompt anormalement long');
      if (threatLevel === 'none') threatLevel = 'low';
    }

    // Check for repeated patterns (spam)
    const words = prompt.split(/\s+/);
    const uniqueWords = new Set(words);
    if (words.length > 50 && uniqueWords.size / words.length < 0.3) {
      risks.push('Pattern de répétition détecté');
      if (threatLevel === 'none') threatLevel = 'low';
    }

    return {
      safe: risks.length === 0,
      risks,
      sanitizedPrompt: this.sanitizePrompt(prompt),
      threatLevel,
    };
  }

  /**
   * Sanitize a prompt by removing or escaping dangerous patterns
   */
  sanitizePrompt(prompt: string): string {
    let sanitized = prompt;

    // Remove system tag injections
    sanitized = sanitized.replace(/<\|im_start\|>/gi, '[FILTERED]');
    sanitized = sanitized.replace(/<\|im_end\|>/gi, '[FILTERED]');

    // Remove potential system role injections
    sanitized = sanitized.replace(/^system\s*:/gim, '[FILTERED]:');

    // Trim whitespace
    sanitized = sanitized.trim();

    // Limit length
    if (sanitized.length > 8000) {
      sanitized = sanitized.substring(0, 8000) + '... [tronqué]';
    }

    return sanitized;
  }

  /**
   * Validate code for safe execution
   */
  validateCode(code: string, language: string = 'javascript'): ValidationResult {
    const risks: string[] = [];
    let threatLevel: ValidationResult['threatLevel'] = 'none';

    if (language === 'javascript' || language === 'typescript') {
      for (const pattern of DANGEROUS_CODE_PATTERNS) {
        if (pattern.test(code)) {
          risks.push(`Pattern dangereux détecté: ${pattern.source}`);
          threatLevel = 'critical';
        }
      }
    }

    return {
      safe: risks.length === 0,
      risks,
      sanitizedPrompt: code,
      threatLevel,
    };
  }
}
