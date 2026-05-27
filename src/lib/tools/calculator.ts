// Calculator Tool — Safe mathematical expression evaluation

import type { ToolDefinition } from './registry';

// Only allow: numbers, +, -, *, /, %, (, ), ., spaces, and common math functions
const SAFE_MATH_PATTERN = /^[\d\s+\-*/%.()eE,]+$/;

// Map of safe math functions
const MATH_FUNCTIONS: Record<string, (...args: number[]) => number> = {
  abs: Math.abs,
  ceil: Math.ceil,
  floor: Math.floor,
  round: Math.round,
  sqrt: (n: number) => {
    if (n < 0) throw new Error('Impossible de calculer la racine carrée d\'un nombre négatif');
    return Math.sqrt(n);
  },
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  log: (n: number) => {
    if (n <= 0) throw new Error('Logarithme non défini pour les valeurs ≤ 0');
    return Math.log(n);
  },
};

export const calculatorTool: ToolDefinition = {
  name: 'calculator',
  description: 'Évaluer des expressions mathématiques. Supporte l\'arithmétique de base, les pourcentages et les formules simples (abs, ceil, floor, round, sqrt, min, max, pow, log).',
  parameters: {
    expression: {
      type: 'string',
      description: 'Expression mathématique à évaluer (ex: "150 * 0.2 + 50", "sqrt(144)", "pow(2, 10)")',
      required: true,
    },
  },
  category: 'compute',
  execute: async (params) => {
    const expression = (params.expression as string).trim();

    // Security check: reject obviously dangerous patterns
    if (expression.length > 500) {
      throw new Error('Expression trop longue (max 500 caractères)');
    }

    // Check for basic safe pattern (without function names first)
    const expressionWithoutFunctions = expression
      .replace(/(abs|ceil|floor|round|sqrt|min|max|pow|log)\s*\(/g, '')
      .replace(/[a-zA-Z]/g, ''); // Remove any remaining letters

    if (!SAFE_MATH_PATTERN.test(expressionWithoutFunctions) && expressionWithoutFunctions.length > 0) {
      // Allow some flexibility for function names
      const cleanExpr = expression.replace(/(abs|ceil|floor|round|sqrt|min|max|pow|log)/g, '');
      if (!SAFE_MATH_PATTERN.test(cleanExpr)) {
        throw new Error('Expression contient des caractères non autorisés. Seuls les nombres, opérateurs (+, -, *, /, %) et fonctions mathématiques sont acceptés.');
      }
    }

    try {
      // Replace math functions with Math.xxx equivalents for safe evaluation
      let safeExpression = expression;
      for (const fn of Object.keys(MATH_FUNCTIONS)) {
        const regex = new RegExp(`\\b${fn}\\s*\\(`, 'g');
        safeExpression = safeExpression.replace(regex, `MATH.${fn}(`);
      }

      // Create a safe evaluation context
      const MATH = MATH_FUNCTIONS;
      const result = new Function('MATH', `"use strict"; return (${safeExpression})`)(MATH);

      if (typeof result !== 'number' || !isFinite(result)) {
        if (typeof result === 'number' && isNaN(result)) {
          throw new Error('Le résultat est NaN (pas un nombre)');
        }
        if (typeof result === 'number' && !isFinite(result)) {
          throw new Error('Le résultat est infini');
        }
        throw new Error('Le résultat n\'est pas un nombre valide');
      }

      return {
        expression,
        result,
        formatted: Number.isInteger(result) ? result.toString() : result.toFixed(6).replace(/\.?0+$/, ''),
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Erreur de calcul: ${error.message}`);
      }
      throw new Error('Erreur d\'évaluation de l\'expression mathématique');
    }
  },
};
