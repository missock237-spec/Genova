// AI Router — Routes to Groq (speed) or OpenRouter (intelligence) based on task type
// ⚠️ API keys are loaded from environment variables for security

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// Model configurations
const MODELS = {
  // Groq models (fast)
  groq_llama: { provider: 'groq', model: 'llama-3.3-70b-versatile', use: 'general' },
  groq_deepseek: { provider: 'groq', model: 'deepseek-r1-distill-llama-70b', use: 'reasoning' },
  groq_qwen: { provider: 'groq', model: 'qwen-qwq-32b', use: 'code' },

  // OpenRouter models (intelligent)
  openrouter_deepseek: { provider: 'openrouter', model: 'deepseek/deepseek-chat:free', use: 'general' },
  openrouter_qwen: { provider: 'openrouter', model: 'qwen/qwen3-235b-a22b:free', use: 'general' },
  openrouter_mistral: { provider: 'openrouter', model: 'mistralai/mistral-small-3.1-24b-instruct:free', use: 'general' },
  openrouter_gemma: { provider: 'openrouter', model: 'google/gemma-3-27b-it:free', use: 'general' },
};

type TaskType = 'quick_chat' | 'reasoning' | 'code' | 'marketing' | 'analysis' | 'orchestration' | 'validation';

// Smart routing: pick best model for task
function routeToModel(task: TaskType) {
  switch (task) {
    case 'quick_chat':
      return MODELS.groq_llama; // Fast for quick responses
    case 'reasoning':
      return MODELS.groq_deepseek; // Deep reasoning
    case 'code':
      return MODELS.groq_qwen; // Code generation
    case 'marketing':
      return MODELS.openrouter_deepseek; // Creative writing
    case 'analysis':
      return MODELS.openrouter_qwen; // Complex analysis
    case 'orchestration':
      return MODELS.openrouter_deepseek; // Planning
    case 'validation':
      return MODELS.groq_llama; // Quick validation
    default:
      return MODELS.groq_llama;
  }
}

// Get API base URL for provider
function getBaseUrl(provider: string) {
  return provider === 'groq' ? GROQ_BASE : OPENROUTER_BASE;
}

function getApiKey(provider: string) {
  return provider === 'groq' ? GROQ_API_KEY : OPENROUTER_API_KEY;
}

// Streaming chat completion
export async function streamChat(
  messages: Array<{ role: string; content: string }>,
  taskType: TaskType = 'quick_chat'
): Promise<ReadableStream> {
  const config = routeToModel(taskType);
  const baseUrl = getBaseUrl(config.provider);
  const apiKey = getApiKey(config.provider);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(config.provider === 'openrouter' && {
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://genova.ai',
        'X-Title': 'Genova',
      }),
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API error: ${response.status} ${response.statusText}`);
  }

  return response.body!;
}

// Non-streaming chat completion
export async function chatCompletion(
  messages: Array<{ role: string; content: string }>,
  taskType: TaskType = 'quick_chat'
): Promise<{ content: string; model: string; provider: string }> {
  const config = routeToModel(taskType);
  const baseUrl = getBaseUrl(config.provider);
  const apiKey = getApiKey(config.provider);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(config.provider === 'openrouter' && {
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://genova.ai',
        'X-Title': 'Genova',
      }),
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    model: config.model,
    provider: config.provider,
  };
}

// Orchestrate with plan output
export async function orchestrate(
  command: string,
  agentList: Array<{ id: string; name: string; type: string }>,
  taskType: TaskType = 'orchestration'
): Promise<{ content: string; model: string; provider: string }> {
  const messages = [
    {
      role: 'system',
      content: `Tu es l'orchestrateur Genova. Tu analyses les commandes en langage naturel et les transforme en plans d'action utilisant les agents IA disponibles. Réponds TOUJOURS en JSON valide avec cette structure:
{
  "understanding": "Compréhension de la demande",
  "steps": [
    { "title": "Titre de l'étape", "description": "Description détaillée", "agentType": "type d'agent suggéré", "priority": "high/medium/low/critical", "estimatedDuration": "temps estimé" }
  ],
  "estimatedTime": "Temps total estimé",
  "summary": "Résumé du plan",
  "riskAssessment": "Évaluation des risques",
  "recommendedModel": "groq ou openrouter selon la complexité"
}
Types d'agents disponibles: sales, support, marketing, research, rh, accounting, custom. Parle en français.`,
    },
    {
      role: 'user',
      content: `Agents disponibles: ${JSON.stringify(agentList)}\n\nCommande: ${command}`,
    },
  ];

  return chatCompletion(messages, taskType);
}

// Validate action against guardrails
export async function validateAction(
  action: string,
  context: string,
  guardrails: Array<{ name: string; type: string; rules: string; severity: string }>,
  taskType: TaskType = 'validation'
): Promise<{ content: string; model: string; provider: string }> {
  const messages = [
    {
      role: 'system',
      content: `Tu es le système de validation Genova. Tu vérifies si une action respecte les garde-fous définis. Réponds TOUJOURS en JSON valide:
{
  "valid": true/false,
  "message": "Message explicatif",
  "details": [{ "guardrailName": "nom", "passed": true/false, "reason": "raison" }],
  "severity": "info/warning/critical/blocking",
  "suggestedAction": "action suggérée si invalide"
}
Parle en français.`,
    },
    {
      role: 'user',
      content: `Garde-fous actifs: ${JSON.stringify(guardrails)}\n\nAction à valider: ${action}\nContexte: ${context || 'Aucun'}`,
    },
  ];

  return chatCompletion(messages, taskType);
}

export { routeToModel, MODELS, type TaskType };
