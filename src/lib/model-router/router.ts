/**
 * @module model-router/router
 * @description Routeur et couche d'exécution principale pour les modèles d'IA.
 * Ce module assure la résolution des modèles, le routage vers le bon fournisseur,
 * l'exécution normalisée des requêtes et le suivi de l'utilisation.
 */

import type {
  ModelRequest,
  ModelResponse,
  ModelInfo,
  ToolCall,
  Message,
} from './types';
import { getModel, selectBestModel } from './registry';

// ---------------------------------------------------------------------------
// Cartographie des clés API par fournisseur
// ---------------------------------------------------------------------------

/**
 * Noms des variables d'environnement pour chaque fournisseur.
 * @internal
 */
const API_KEY_ENV_VARS: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  groq: 'GROQ_API_KEY',
  huggingface: 'HUGGINGFACE_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

/**
 * Récupère la clé API d'un fournisseur depuis les variables d'environnement.
 *
 * @param {string} provider - Nom du fournisseur
 * @returns {string | null} Clé API ou null si non trouvée
 * @internal
 */
function getApiKey(provider: string): string | null {
  const envVar = API_KEY_ENV_VARS[provider];
  if (!envVar) return null;
  return (typeof process !== 'undefined' && process.env?.[envVar]) || null;
}

// ---------------------------------------------------------------------------
// Suivi de l'utilisation (non-bloquant)
// ---------------------------------------------------------------------------

/**
 * Enregistre le coût et l'utilisation de manière asynchrone et non-bloquante.
 * Utilise un import dynamique pour éviter les dépendances circulaires.
 *
 * @param {ModelInfo} model - Modèle utilisé
 * @param {ModelResponse} response - Réponse obtenue
 * @param {string} [userId] - Identifiant utilisateur optionnel
 * @internal
 */
async function trackUsage(
  model: ModelInfo,
  response: ModelResponse,
  userId?: string,
): Promise<void> {
  try {
    // Import dynamique pour éviter le chargement de la base de données au démarrage
    const db = await import('@/lib/db').catch(() => null);
    if (!db) return;

    const promptTokens = response.usage.promptTokens;
    const completionTokens = response.usage.completionTokens;
    const costUsd =
      (promptTokens / 1000) * model.inputCostPer1k +
      (completionTokens / 1000) * model.outputCostPer1k;

    // Enregistrement du coût — ne bloque jamais l'exécution principale
    if (db.aICost?.create) {
      db.aICost.create({
        data: {
          modelId: model.id,
          provider: model.provider,
          promptTokens,
          completionTokens,
          totalTokens: response.usage.totalTokens,
          costUsd,
          userId: userId ?? null,
          timestamp: new Date(),
        },
      }).catch(() => {
        /* échec silencieux du suivi des coûts */
      });
    }

    // Enregistrement de l'utilisation par agent
    if (db.agentUsage?.create && userId) {
      db.agentUsage.create({
        data: {
          userId,
          modelId: model.id,
          promptTokens,
          completionTokens,
          costUsd,
          timestamp: new Date(),
        },
      }).catch(() => {
        /* échec silencieux */
      });
    }
  } catch {
    /* Le suivi des coûts ne doit jamais interrompre le flux principal */
  }
}

// ---------------------------------------------------------------------------
// Générateur d'identifiants de réponse
// ---------------------------------------------------------------------------

/**
 * Génère un identifiant unique pour une réponse de modèle.
 *
 * @returns {string} Identifiant unique au format "gen3ia_<timestamp>_<random>"
 * @internal
 */
function generateResponseId(): string {
  return `gen3ia_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Adaptateurs de fournisseurs — fonctions privées
// ---------------------------------------------------------------------------

/**
 * Normalise les messages pour le format OpenAI (utilisé aussi par Groq et OpenRouter).
 *
 * @param {Message[]} messages - Messages à normaliser
 * @returns {Array<object>} Messages au format OpenAI
 * @internal
 */
function normalizeToOpenAIMessages(messages: Message[]): Array<Record<string, unknown>> {
  return messages.map((msg) => {
    const normalized: Record<string, unknown> = { role: msg.role };

    if (typeof msg.content === 'string') {
      normalized.content = msg.content;
    } else {
      normalized.content = msg.content;
    }

    if (msg.tool_calls) {
      normalized.tool_calls = msg.tool_calls;
    }

    if (msg.tool_call_id) {
      normalized.tool_call_id = msg.tool_call_id;
    }

    return normalized;
  });
}

/**
 * Convertit les messages au format spécifique à Anthropic.
 * Anthropic sépare le message système du reste et utilise un format légèrement différent.
 *
 * @param {Message[]} messages - Messages à convertir
 * @returns {{ system: string | undefined; messages: Array<object> }} Messages au format Anthropic
 * @internal
 */
function normalizeToAnthropicMessages(messages: Message[]): {
  system: string | undefined;
  messages: Array<Record<string, unknown>>;
} {
  let system: string | undefined;
  const converted: Array<Record<string, unknown>> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      // Anthropic attend le système séparément
      system = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      continue;
    }

    if (msg.role === 'tool') {
      converted.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: msg.tool_call_id,
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          },
        ],
      });
      continue;
    }

    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      const content: Array<Record<string, unknown>> = [];

      if (typeof msg.content === 'string' && msg.content) {
        content.push({ type: 'text', text: msg.content });
      }

      for (const tc of msg.tool_calls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        });
      }

      converted.push({ role: 'assistant', content });
      continue;
    }

    const anthMsg: Record<string, unknown> = { role: msg.role };

    if (typeof msg.content === 'string') {
      anthMsg.content = msg.content;
    } else {
      anthMsg.content = msg.content;
    }

    converted.push(anthMsg);
  }

  return { system, messages: converted };
}

/**
 * Extrait les appels d'outil depuis une réponse normalisée OpenAI.
 *
 * @param {any} choices - Tableau des choix de réponse
 * @returns {ToolCall[] | undefined} Appels d'outil extraits, ou undefined
 * @internal
 */
function extractToolCalls(choices: any[]): ToolCall[] | undefined {
  const message = choices[0]?.message;
  if (!message?.tool_calls) return undefined;

  return message.tool_calls.map((tc: any) => ({
    id: tc.id,
    type: 'function' as const,
    function: {
      name: tc.function.name,
      arguments: tc.function.arguments,
    },
  }));
}

/**
 * Appelle l'API OpenAI avec la requête normalisée.
 *
 * @param {ModelInfo} model - Informations du modèle
 * @param {ModelRequest} request - Requête de l'utilisateur
 * @returns {Promise<ModelResponse>} Réponse normalisée
 * @throws {Error} Si la clé API est manquante ou si l'API répond avec une erreur
 * @internal
 */
async function callOpenAI(model: ModelInfo, request: ModelRequest): Promise<ModelResponse> {
  const apiKey = getApiKey('openai');
  if (!apiKey) {
    throw new Error('Clé API OpenAI non configurée. Définissez la variable d\'environnement OPENAI_API_KEY.');
  }

  const startMs = Date.now();
  const responseId = generateResponseId();

  const body: Record<string, unknown> = {
    model: model.name,
    messages: normalizeToOpenAIMessages(request.messages),
  };

  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
  if (request.tools) body.tools = request.tools;
  if (request.toolChoice !== undefined) body.tool_choice = request.toolChoice;
  if (request.responseFormat) body.response_format = request.responseFormat;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erreur API OpenAI (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const choice = data.choices[0];
  const usage = data.usage;
  const latencyMs = Date.now() - startMs;

  return {
    id: responseId,
    model: model.name,
    provider: model.provider,
    content: choice.message.content ?? '',
    toolCalls: extractToolCalls(data.choices),
    usage: {
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
      totalTokens: usage.total_tokens ?? 0,
    },
    finishReason: choice.finish_reason ?? 'stop',
    latencyMs,
  };
}

/**
 * Appelle l'API Anthropic avec la requête normalisée.
 * Utilise le format spécifique à l'API Messages d'Anthropic.
 *
 * @param {ModelInfo} model - Informations du modèle
 * @param {ModelRequest} request - Requête de l'utilisateur
 * @returns {Promise<ModelResponse>} Réponse normalisée
 * @throws {Error} Si la clé API est manquante ou si l'API répond avec une erreur
 * @internal
 */
async function callAnthropic(model: ModelInfo, request: ModelRequest): Promise<ModelResponse> {
  const apiKey = getApiKey('anthropic');
  if (!apiKey) {
    throw new Error('Clé API Anthropic non configurée. Définissez la variable d\'environnement ANTHROPIC_API_KEY.');
  }

  const startMs = Date.now();
  const responseId = generateResponseId();
  const { system, messages } = normalizeToAnthropicMessages(request.messages);

  const body: Record<string, unknown> = {
    model: model.name,
    messages,
    max_tokens: request.maxTokens ?? model.maxOutputTokens,
  };

  if (system) body.system = system;
  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.tools) body.tools = request.tools;
  if (request.toolChoice !== undefined) body.tool_choice = request.toolChoice;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erreur API Anthropic (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const latencyMs = Date.now() - startMs;

  // Extraction du contenu textuel
  let content = '';
  const toolCalls: ToolCall[] = [];

  for (const block of data.content ?? []) {
    if (block.type === 'text') {
      content += block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        },
      });
    }
  }

  const finishReason = data.stop_reason === 'tool_use' ? 'tool_calls' : (data.stop_reason ?? 'stop');

  return {
    id: responseId,
    model: model.name,
    provider: model.provider,
    content,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    usage: {
      promptTokens: data.usage?.input_tokens ?? 0,
      completionTokens: data.usage?.output_tokens ?? 0,
      totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
    },
    finishReason,
    latencyMs,
  };
}

/**
 * Appelle l'API Groq (compatible OpenAI) avec la requête normalisée.
 *
 * @param {ModelInfo} model - Informations du modèle
 * @param {ModelRequest} request - Requête de l'utilisateur
 * @returns {Promise<ModelResponse>} Réponse normalisée
 * @throws {Error} Si la clé API est manquante ou si l'API répond avec une erreur
 * @internal
 */
async function callGroq(model: ModelInfo, request: ModelRequest): Promise<ModelResponse> {
  const apiKey = getApiKey('groq');
  if (!apiKey) {
    throw new Error('Clé API Groq non configurée. Définissez la variable d\'environnement GROQ_API_KEY.');
  }

  const startMs = Date.now();
  const responseId = generateResponseId();

  const body: Record<string, unknown> = {
    model: model.name,
    messages: normalizeToOpenAIMessages(request.messages),
  };

  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
  if (request.tools) body.tools = request.tools;
  if (request.toolChoice !== undefined) body.tool_choice = request.toolChoice;
  if (request.responseFormat) body.response_format = request.responseFormat;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erreur API Groq (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const choice = data.choices[0];
  const usage = data.usage;
  const latencyMs = Date.now() - startMs;

  return {
    id: responseId,
    model: model.name,
    provider: model.provider,
    content: choice.message.content ?? '',
    toolCalls: extractToolCalls(data.choices),
    usage: {
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
      totalTokens: usage.total_tokens ?? 0,
    },
    finishReason: choice.finish_reason ?? 'stop',
    latencyMs,
  };
}

/**
 * Appelle l'API HuggingFace Inference avec la requête normalisée.
 * Utilise le point de terminaison de complétion de chat.
 *
 * @param {ModelInfo} model - Informations du modèle
 * @param {ModelRequest} request - Requête de l'utilisateur
 * @returns {Promise<ModelResponse>} Réponse normalisée
 * @throws {Error} Si la clé API est manquante ou si l'API répond avec une erreur
 * @internal
 */
async function callHuggingFace(model: ModelInfo, request: ModelRequest): Promise<ModelResponse> {
  const apiKey = getApiKey('huggingface');
  if (!apiKey) {
    throw new Error('Clé API HuggingFace non configurée. Définissez la variable d\'environnement HUGGINGFACE_API_KEY.');
  }

  const startMs = Date.now();
  const responseId = generateResponseId();

  const body: Record<string, unknown> = {
    model: model.name,
    messages: normalizeToOpenAIMessages(request.messages),
  };

  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;

  const response = await fetch(`https://api-inference.huggingface.co/models/${model.name}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erreur API HuggingFace (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const choice = data.choices[0];
  const usage = data.usage;
  const latencyMs = Date.now() - startMs;

  return {
    id: responseId,
    model: model.name,
    provider: model.provider,
    content: choice.message.content ?? '',
    toolCalls: extractToolCalls(data.choices),
    usage: {
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
      totalTokens: usage.total_tokens ?? 0,
    },
    finishReason: choice.finish_reason ?? 'stop',
    latencyMs,
  };
}

/**
 * Appelle l'API OpenRouter (compatible OpenAI) avec la requête normalisée.
 *
 * @param {ModelInfo} model - Informations du modèle
 * @param {ModelRequest} request - Requête de l'utilisateur
 * @returns {Promise<ModelResponse>} Réponse normalisée
 * @throws {Error} Si la clé API est manquante ou si l'API répond avec une erreur
 * @internal
 */
async function callOpenRouter(model: ModelInfo, request: ModelRequest): Promise<ModelResponse> {
  const apiKey = getApiKey('openrouter');
  if (!apiKey) {
    throw new Error('Clé API OpenRouter non configurée. Définissez la variable d\'environnement OPENROUTER_API_KEY.');
  }

  const startMs = Date.now();
  const responseId = generateResponseId();

  const body: Record<string, unknown> = {
    model: model.name,
    messages: normalizeToOpenAIMessages(request.messages),
  };

  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
  if (request.tools) body.tools = request.tools;
  if (request.toolChoice !== undefined) body.tool_choice = request.toolChoice;
  if (request.responseFormat) body.response_format = request.responseFormat;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://gen3ia.dev',
      'X-Title': 'Gen3ia Platform',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erreur API OpenRouter (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const choice = data.choices[0];
  const usage = data.usage;
  const latencyMs = Date.now() - startMs;

  return {
    id: responseId,
    model: model.name,
    provider: model.provider,
    content: choice.message.content ?? '',
    toolCalls: extractToolCalls(data.choices),
    usage: {
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
      totalTokens: usage.total_tokens ?? 0,
    },
    finishReason: choice.finish_reason ?? 'stop',
    latencyMs,
  };
}

// ---------------------------------------------------------------------------
// Table de routage des adaptateurs
// ---------------------------------------------------------------------------

/**
 * Mappe chaque fournisseur à son adaptateur d'exécution.
 * @internal
 */
const PROVIDER_ADAPTERS: Record<
  string,
  (model: ModelInfo, request: ModelRequest) => Promise<ModelResponse>
> = {
  openai: callOpenAI,
  anthropic: callAnthropic,
  groq: callGroq,
  huggingface: callHuggingFace,
  openrouter: callOpenRouter,
};

// ---------------------------------------------------------------------------
// Fonctions publiques
// ---------------------------------------------------------------------------

/**
 * Route et exécute une requête vers le modèle d'IA approprié.
 *
 * Cette fonction est le point d'entrée principal du routeur de modèles.
 * Elle effectue les étapes suivantes :
 * 1. Résout le modèle depuis le registre par son identifiant
 * 2. Si l'identifiant n'est pas trouvé, sélectionne automatiquement le meilleur modèle
 * 3. Vérifie que la clé API du fournisseur est disponible
 * 4. Route vers l'adaptateur approprié pour le fournisseur
 * 5. Exécute la requête et normalise la réponse
 * 6. Suit l'utilisation de manière asynchrone et non-bloquante
 *
 * @param {ModelRequest} request - Requête complète avec le modèle, les messages et les options
 * @returns {Promise<ModelResponse>} Réponse normalisée du modèle
 * @throws {Error} Si aucun modèle correspondant n'est trouvé, si la clé API manque,
 *                   ou si le fournisseur n'est pas supporté
 *
 * @example
 * ```ts
 * const response = await routeAndExecute({
 *   model: 'openai:gpt-4o',
 *   messages: [
 *     { role: 'system', content: 'Tu es un assistant utile.' },
 *     { role: 'user', content: 'Bonjour !' },
 *   ],
 *   temperature: 0.7,
 *   userId: 'user-123',
 * });
 * console.log(response.content);
 * console.log(`Coût: $${(response.usage.promptTokens / 1000 * 0.0025 + response.usage.completionTokens / 1000 * 0.01).toFixed(6)}`);
 * ```
 */
export async function routeAndExecute(request: ModelRequest): Promise<ModelResponse> {
  // Étape 1 : Résolution du modèle depuis le registre
  let model = getModel(request.model);

  // Étape 2 : Sélection automatique si le modèle n'est pas trouvé
  if (!model) {
    // Déduire les capacités requises depuis la requête
    const requiredCapabilities: Array<string> = ['chat'];
    if (request.tools && request.tools.length > 0) {
      requiredCapabilities.push('function_calling');
    }
    if (request.responseFormat?.type === 'json_object') {
      requiredCapabilities.push('json_mode');
    }
    // Vérifier si les messages contiennent des images
    const hasImages = request.messages.some((msg) => {
      if (typeof msg.content !== 'object') return false;
      return (msg.content as Array<{ type: string }>).some((p) => p.type === 'image_url');
    });
    if (hasImages) {
      requiredCapabilities.push('vision');
    }

    model = selectBestModel({
      requiredCapabilities: requiredCapabilities as any,
      preferLowCost: true,
    });

    if (!model) {
      throw new Error(
        `Aucun modèle trouvé pour l'identifiant "${request.model}" et aucun modèle alternatif ne correspond aux capacités requises: [${requiredCapabilities.join(', ')}]`,
      );
    }
  }

  // Vérification de disponibilité
  if (!model.available) {
    throw new Error(`Le modèle "${model.id}" n'est actuellement pas disponible.`);
  }

  // Étape 3 : Vérification de la clé API (sauf pour le fournisseur local)
  if (model.provider !== 'local') {
    const apiKey = getApiKey(model.provider);
    if (!apiKey) {
      throw new Error(
        `Clé API non configurée pour le fournisseur "${model.provider}". ` +
          `Définissez la variable d'environnement "${API_KEY_ENV_VARS[model.provider]}".`,
      );
    }
  }

  // Étape 4 : Routage vers l'adaptateur approprié
  const adapter = PROVIDER_ADAPTERS[model.provider];
  if (!adapter) {
    throw new Error(
      `Fournisseur "${model.provider}" non supporté. Fournisseurs disponibles : ${Object.keys(PROVIDER_ADAPTERS).join(', ')}.`,
    );
  }

  // Étape 5 : Exécution de la requête
  const response = await adapter(model, request);

  // Étape 6 : Suivi de l'utilisation (non-bloquant)
  trackUsage(model, response, request.userId).catch(() => {
    /* Le suivi ne doit jamais bloquer */
  });

  return response;
}

/**
 * Route et exécute une requête en mode flux (streaming).
 *
 * Pour le moment, cette fonction est un simple wrapper qui appelle
 * `routeAndExecute` et cède le résultat complet comme un seul morceau.
 * Le streaming complet avec des morceaux incrémentaux sera implémenté
 * dans une version ultérieure.
 *
 * @param {ModelRequest} request - Requête complète avec le modèle, les messages et les options
 * @yields {Partial<ModelResponse>} Morceaux de la réponse du modèle
 *
 * @example
 * ```ts
 * for await (const chunk of streamModel({
 *   model: 'openai:gpt-4o-mini',
 *   messages: [{ role: 'user', content: 'Raconte-moi une histoire.' }],
 *   stream: true,
 * })) {
 *   if (chunk.content) process.stdout.write(chunk.content);
 * }
 * ```
 */
export async function* streamModel(
  request: ModelRequest,
): AsyncGenerator<Partial<ModelResponse>> {
  // Force l'activation du mode flux dans la requête
  const streamRequest = { ...request, stream: true };

  // Pour le moment, exécuter en mode non-flux et céder le résultat complet.
  // L'implémentation complète du streaming avec les Server-Sent Events
  // sera ajoutée dans une itération ultérieure.
  const response = await routeAndExecute(streamRequest);

  yield {
    id: response.id,
    model: response.model,
    provider: response.provider,
    content: response.content,
    toolCalls: response.toolCalls,
    usage: response.usage,
    finishReason: response.finishReason,
    latencyMs: response.latencyMs,
  };
}
