import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const dynamic = "force-dynamic";
const ALLOWED_LANGUAGES = ['javascript','typescript','python','html','css','jsx','tsx','sql','bash','json','yaml','markdown'];

const SYSTEM_PROMPTS: Record<string, string> = {
  javascript: 'Genere du code JavaScript moderne ES2020+. Retourne UNIQUEMENT le code sans explication.',
  typescript: 'Genere du code TypeScript type. Inclus les interfaces. Retourne UNIQUEMENT le code.',
  python: 'Genere du code Python 3.11+. Retourne UNIQUEMENT le code sans explication.',
  html: 'Genere du HTML5 complet. Retourne UNIQUEMENT le code.',
  css: 'Genere du CSS moderne Flexbox/Grid. Retourne UNIQUEMENT le code.',
  jsx: 'Genere du React JSX fonctionnel avec hooks. Retourne UNIQUEMENT le code.',
  tsx: 'Genere du React TypeScript avec interfaces et hooks. Retourne UNIQUEMENT le code.',
  sql: 'Genere des requetes SQL PostgreSQL. Retourne UNIQUEMENT le code.',
  bash: 'Genere un script bash. Retourne UNIQUEMENT le code.',
  json: 'Genere du JSON valide. Retourne UNIQUEMENT le JSON.',
  yaml: 'Genere du YAML valide. Retourne UNIQUEMENT le YAML.',
  markdown: 'Genere du Markdown. Retourne UNIQUEMENT le markdown.',
};

const FALLBACK_TEMPLATES: Record<string, (prompt: string) => string> = {
  javascript: (p) => '// ' + p + '\nfunction solution(input) {\n  return input;\n}\nconsole.log(solution("test"));',
  typescript: (p) => '// ' + p + '\ninterface Input { data: string; }\nfunction process(input: Input): string {\n  return "Result: " + input.data;\n}\nconsole.log(process({ data: "hello" }));',
  python: (p) => '# ' + p + '\ndef solution(data):\n    return data\n\nif __name__ == "__main__":\n    print(solution("test"))',
  html: (p) => '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>' + p + '</title><style>body{font-family:sans-serif;padding:2rem;}</style></head><body><h1>' + p + '</h1></body></html>',
  css: (p) => '/* ' + p + ' */\nbody {\n  font-family: system-ui, sans-serif;\n  background: linear-gradient(135deg, #667eea, #764ba2);\n  min-height: 100vh;\n  display: flex;\n  justify-content: center;\n  align-items: center;\n}',
  jsx: (p) => 'import React, { useState } from "react";\nconst App = () => {\n  const [count, setCount] = useState(0);\n  return (<div style={{padding:20}}><h1>' + p + '</h1><p>Count: {count}</p><button onClick={()=>setCount(c=>c+1)}>+</button></div>);\n};\nexport default App;',
  tsx: (_p) => 'interface Props { title: string; }\nconst App: React.FC<Props> = ({ title }) => {\n  return <h1 style={{color:"#6c5ce7"}}>{title}</h1>;\n};\nexport default App;',
  sql: (p) => '-- ' + p + '\nSELECT * FROM table_name\nWHERE condition = true\nORDER BY created_at DESC\nLIMIT 100;',
  bash: (p) => '#!/bin/bash\n# ' + p + '\nset -euo pipefail\necho "Execution..."',
};

/**
 * Authentifie de façon mode-agnostique (cookie session Firebase OU JWT
 * standalone, Bearer, X-API-Key) via applySecurity(). L'ancien code utilisait
 * getServerSession() de @/lib/auth (ré-export Firebase UNIQUEMENT) : en mode
 * standalone le cookie gen3ia_session est un JWT HS256 qui échouait la vérif
 * Firebase-only → 401 → le visualiseur de code était inutilisable.
 */
async function requireUser(request: NextRequest): Promise<{ userId: string; ok: true } | { ok: false; res: NextResponse }> {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error) return { ok: false, res: error };
  if (!auth?.userId) return { ok: false, res: NextResponse.json({ error: 'Non authentifie' }, { status: 401 }) };
  return { ok: true, userId: auth.userId };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return auth.res;

    const { prompt, language = 'javascript' } = await request.json().catch(() => ({ prompt: undefined, language: 'javascript' }));
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt requis' }, { status: 400 });
    }
    const lang = String(language).toLowerCase();
    if (!ALLOWED_LANGUAGES.includes(lang)) {
      return NextResponse.json({ error: 'Langage non supporte: ' + lang }, { status: 400 });
    }
    let code: string;
    let usedAI = false;
    try {
      const systemPrompt = SYSTEM_PROMPTS[lang] || 'Genere du code. Retourne UNIQUEMENT le code.';
      const { chatCompletion } = await import('@/lib/ai-router');
      const result = await chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
// @ts-ignore — type narrowing pending, see refactor ticket
      ], 'code');
      code = result.content.trim().replace(/^```\w*\n?/, '').replace(/\n?```$/g, '').trim();
      usedAI = true;
    } catch {
      const fallback = FALLBACK_TEMPLATES[lang];
      code = fallback ? fallback(prompt) : '// ' + prompt + '\nconsole.log("Generated");';
    }
    return NextResponse.json({
      success: true, code, language: lang,
      lines: code.split('\n').length,
      characters: code.length,
      usedAI,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Erreur: ' + (error instanceof Error ? error.message : 'Inconnue'),
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    languages: ALLOWED_LANGUAGES,
    description: 'API de generation de code via IA.',
    examples: [
      { prompt: 'Une fonction qui calcule la suite de Fibonacci', language: 'javascript' },
      { prompt: 'Un formulaire de connexion React', language: 'tsx' },
      { prompt: 'Une requete SQL pour lister les utilisateurs actifs', language: 'sql' },
    ],
  });
}
