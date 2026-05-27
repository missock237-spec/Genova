// Web Search Tool — Uses z-ai-web-dev-sdk for web search

import type { ToolDefinition } from './registry';

export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  description: 'Rechercher des informations sur le web. Retourne des résultats avec URLs, titres et extraits.',
  parameters: {
    query: { type: 'string', description: 'Requête de recherche', required: true },
    num: { type: 'number', description: 'Nombre de résultats (max 10)', required: false },
  },
  category: 'search',
  execute: async (params) => {
    const query = params.query as string;
    const num = Math.min((params.num as number) || 5, 10);

    try {
      // Use z-ai-web-dev-sdk for web search
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      const zai = await ZAI.create();
      const searchResult = await zai.functions.invoke("web_search", { query, num });

      if (Array.isArray(searchResult)) {
        return searchResult.slice(0, num).map((r: { name?: string; url?: string; snippet?: string }) => ({
          title: r.name || '',
          url: r.url || '',
          snippet: r.snippet || '',
        }));
      }

      return {
        query,
        results: [],
        message: 'Aucun résultat trouvé.',
      };
    } catch {
      return {
        query,
        results: [],
        message: 'Service de recherche web temporairement indisponible. Veuillez réessayer plus tard.',
        fallback: true,
      };
    }
  },
};
