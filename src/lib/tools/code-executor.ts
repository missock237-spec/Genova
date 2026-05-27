// Code Executor Tool — Safe JavaScript/TypeScript code execution in sandbox

import type { ToolDefinition } from './registry';

export const codeExecutorTool: ToolDefinition = {
  name: 'code_executor',
  description: 'Exécuter du code JavaScript simple dans un environnement sandboxé. Retourne la sortie console ou le résultat. Pas d\'accès fichier, réseau ou modules externes.',
  parameters: {
    code: {
      type: 'string',
      description: 'Code JavaScript à exécuter',
      required: true,
    },
    language: {
      type: 'string',
      description: 'Langage: javascript ou typescript',
      required: false,
    },
  },
  category: 'compute',
  isDangerous: true,
  execute: async (params) => {
    const code = params.code as string;
    const language = (params.language as string) || 'javascript';

    // Security checks
    if (code.length > 5000) {
      throw new Error('Code trop long (max 5000 caractères)');
    }

    // Check for forbidden patterns
    const forbiddenPatterns = [
      { pattern: /require\s*\(/, message: 'require() est interdit' },
      { pattern: /import\s+/, message: 'import est interdit' },
      { pattern: /process\./, message: 'process est interdit' },
      { pattern: /child_process/, message: 'child_process est interdit' },
      { pattern: /fs\./, message: 'fs (système de fichiers) est interdit' },
      { pattern: /fetch\s*\(/, message: 'fetch() est interdit' },
      { pattern: /XMLHttpRequest/, message: 'XMLHttpRequest est interdit' },
      { pattern: /WebSocket/, message: 'WebSocket est interdit' },
      { pattern: /document\./, message: 'document (DOM) est interdit' },
      { pattern: /window\./, message: 'window est interdit' },
      { pattern: /global\./, message: 'global est interdit' },
      { pattern: /globalThis/, message: 'globalThis est interdit' },
      { pattern: /eval\s*\(/, message: 'eval() est interdit' },
      { pattern: /Function\s*\(/, message: 'Function() est interdit' },
      { pattern: /setTimeout|setInterval/, message: 'setTimeout/setInterval est interdit' },
      { pattern: /__dirname|__filename/, message: '__dirname/__filename est interdit' },
    ];

    for (const { pattern, message } of forbiddenPatterns) {
      if (pattern.test(code)) {
        throw new Error(`Code non autorisé: ${message}`);
      }
    }

    try {
      // Capture console output
      const logs: string[] = [];
      const mockConsole = {
        log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
        error: (...args: unknown[]) => logs.push('[ERREUR] ' + args.map(String).join(' ')),
        warn: (...args: unknown[]) => logs.push('[ATTENTION] ' + args.map(String).join(' ')),
        info: (...args: unknown[]) => logs.push('[INFO] ' + args.map(String).join(' ')),
      };

      // Provide safe math utilities
      const safeGlobals = {
        Math,
        Date,
        JSON: {
          parse: JSON.parse,
          stringify: JSON.stringify,
        },
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        Array,
        Object,
        String,
        Number,
        Boolean,
        Map: Map,
        Set: Set,
      };

      // Execute in sandboxed context
      const wrappedCode = `
        "use strict";
        const { Math: _Math, Date: _Date, JSON: _JSON, parseInt: _parseInt, parseFloat: _parseFloat, isNaN: _isNaN, isFinite: _isFinite, Array: _Array, Object: _Object, String: _String, Number: _Number, Boolean: _Boolean, Map: _Map, Set: _Set } = __globals;
        const console = __console;
        ${code}
      `;

      const fn = new Function('__console', '__globals', wrappedCode);
      const result = fn(mockConsole, safeGlobals);

      return {
        language,
        result: result !== undefined ? String(result) : undefined,
        consoleOutput: logs,
        success: true,
      };
    } catch (error) {
      return {
        language,
        result: null,
        consoleOutput: [],
        error: error instanceof Error ? error.message : 'Erreur d\'exécution',
        success: false,
      };
    }
  },
};
