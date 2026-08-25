import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';
import { prisma } from '@/lib/prisma';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const SANDBOX_TIMEOUT = 10000;
const MAX_OUTPUT_SIZE = 50000;

interface ExecutionResult {
  output: string;
  error: string | null;
  executionTime: number;
  memoryUsage: number;
  exitCode: number;
}

/**
 * Authentifie de façon mode-agnostique (cookie session Firebase OU JWT
 * standalone, Bearer, X-API-Key) via applySecurity(). L'ancien code utilisait
 * getServerSession() de @/lib/auth (ré-export Firebase UNIQUEMENT) : en mode
 * standalone le cookie gen3ia_session est un JWT HS256 qui échouait la vérif
 * Firebase-only → 401 → le visualiseur/exécuteur de code était inutilisable.
 */
async function requireUser(request: NextRequest): Promise<{ userId: string; ok: true } | { ok: false; res: NextResponse }> {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error) return { ok: false, res: error };
  if (!auth?.userId) return { ok: false, res: NextResponse.json({ error: 'Non authentifie' }, { status: 401 }) };
  return { ok: true, userId: auth.userId };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return auth.res;
    const userId = auth.userId;

    const { code, language, input } = await request.json().catch(() => ({ code: undefined, language: undefined, input: undefined }));
    if (!code || !language) {
      return NextResponse.json({ error: 'Code et langage requis' }, { status: 400 });
    }
    if (code.length > 50000) {
      return NextResponse.json({ error: 'Code trop long (max 50KB)' }, { status: 400 });
    }
    const allowedLanguages = ['javascript','typescript','python','html','css','jsx','tsx','json','bash'];
    if (!allowedLanguages.includes(language)) {
      return NextResponse.json({ error: 'Langage non supporte: ' + language }, { status: 400 });
    }
    const result = await executeInSandbox(code, language, input);
    await prisma.agentActionLog.create({
      data: {
        action: 'code:execute:' + language,
        details: JSON.stringify({ language, codeLength: code.length }),
        status: result.error ? 'failed' : 'completed',
        result: JSON.stringify({ outputLength: result.output.length, executionTime: result.executionTime }),
        userId,
      },
    });
    return NextResponse.json({
      success: !result.error,
      ...result,
      language,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      success: false, output: '',
      error: 'Erreur serveur: ' + (error instanceof Error ? error.message : 'Inconnue'),
      executionTime: Date.now() - startTime, memoryUsage: 0, exitCode: 1,
    }, { status: 500 });
  }
}

// Motifs interdits : le code exécuté ne doit jamais toucher au process hôte.
const FORBIDDEN_PATTERNS: RegExp[] = [
  /require\s*\(/,
  /import\s+["\w{*]/,
  /process\./,
  /global\./,
  /__dirname/,
  /child_process/,
  /eval\s*\(/,
  /new\s+Function\s*\(/,
];

function findForbidden(code: string): string | null {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) return pattern.source;
  }
  return null;
}

async function executeInSandbox(code: string, language: string, input?: string): Promise<ExecutionResult> {
  const startTime = Date.now();
  if (['html','css','jsx','tsx'].includes(language)) {
    return executeFrontendCode(code, language, startTime);
  }
  try {
    let wrappedCode = code;
    if (language === 'typescript') {
      try {
        const ts = await import('typescript');
        const transpiled = ts.transpileModule(code, {
          compilerOptions: { module: 1, target: 2, strict: false, esModuleInterop: true },
        });
        wrappedCode = transpiled.outputText;
      } catch { wrappedCode = code; }
    }

    const blocked = findForbidden(wrappedCode);
    if (blocked) {
      return {
        output: '',
        error: `Blocage sécurité: pattern interdit détecté (${blocked})`,
        executionTime: Date.now() - startTime,
        memoryUsage: 0,
        exitCode: 1,
      };
    }

    // Note : isolated-vm n'est pas installé (absent de package.json) ; son
    // import[i1]` générait une erreur de résolution webpack (crash build/cold
    // start). On exécute donc via le fallback blindé : scope borné, pourri
    // des globals serveur, et timeout.
    const logs: string[] = [];
    const safeConsole = {
      log: (...args: unknown[]) => { logs.push(args.map(String).join(' ')); },
      error: (...args: unknown[]) => { logs.push('[ERROR] ' + args.map(String).join(' ')); },
      warn: (...args: unknown[]) => { logs.push('[WARN] ' + args.map(String).join(' ')); },
    };
    const blockProxy = new Proxy({}, {
      get: () => { throw new Error('Accès global interdit'); },
      set: () => { throw new Error('Accès global interdit'); },
    });

    const fn = new Function('console', 'input', 'process', 'require', 'global', 'module',
      'const process=undefined;const require=undefined;const global=undefined;const module=undefined;' +
      wrappedCode
    );

    await Promise.race([
      Promise.resolve().then(() => fn(safeConsole, input || '', blockProxy, blockProxy, blockProxy, blockProxy)),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout execution')), SANDBOX_TIMEOUT)
      ),
    ]);

    const output = logs.join('\n').slice(0, MAX_OUTPUT_SIZE);
    return { output, error: null, executionTime: Date.now() - startTime, memoryUsage: 0, exitCode: 0 };
  } catch (error) {
    return {
      output: '',
      error: 'Erreur: ' + (error instanceof Error ? error.message : 'Inconnue'),
      executionTime: Date.now() - startTime,
      memoryUsage: 0, exitCode: 1,
    };
  }
}

function executeFrontendCode(code: string, language: string, startTime: number): ExecutionResult {
  let html = '', css = '', js = '';
  if (language === 'html') html = code;
  else if (language === 'css') css = code;
  else js = code;
  const fullHtml = '<!DOCTYPE html><html><head><style>' + css + '</style></head><body>' +
    (html.includes('<body>') ? html : '<div id="root">' + html + '</div>') +
    '<script>' + js + '</script></body></html>';
  return { output: fullHtml.slice(0, MAX_OUTPUT_SIZE), error: null, executionTime: Date.now() - startTime, memoryUsage: 0, exitCode: 0 };
}
