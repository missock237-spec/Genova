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
      const { createWebSearch } = await import('z-ai-web-dev-sdk');
      const webSearch = createWebSearch();
      const results = await webSearch.search({ query, num });

      if (results && results.results) {
        return results.results.slice(0, num).map((r: { title?: string; url?: string; snippet?: string; description?: string }) => ({
          title: r.title || '',
          url: r.url || '',
          snippet: r.snippet || r.description || '',
        }));
      }

      // Fallback: return a structured response indicating no results
      return {
        query,
        results: [],
        message: 'Aucun résultat trouvé. L\'outil de recherche web nécessite une connexion API.',
      };
    } catch {
      // Fallback response when web search API is not available
      return {
        query,
        results: [],
        message: 'Service de recherche web temporairement indisponible. Veuillez réessayer plus tard.',
        fallback: true,
      };
    }
  },
};
