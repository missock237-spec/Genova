// ============================================================
// Plugin Registry — LEGACY (redirige vers plugin-engine)
//
// Ce fichier est conservé pour la rétrocompatibilité des imports.
// Le système de production est maintenant src/lib/plugin-engine/.
// Les 295+ entrées stubs ont été supprimées — le catalogue
// officiel de 43+ applications réelles est dans plugin-engine/catalog.ts.
//
// Pour lister les plugins disponibles :
//   import { listCatalog, PLUGIN_CATALOG } from '@/lib/plugin-engine';
// ============================================================

import type { z } from 'zod';

export interface PluginAction {
  id: string;
  name: string;
  description: string;
  inputSchema: z.ZodType<any>;
  outputSchema: z.ZodType<any>;
  authType: 'api_key' | 'oauth' | 'oauth2' | 'none';
  category: string;
  popularity: number;
  execute: (params: any, credentials: any) => Promise<any>;
}

export interface Plugin {
  id: string;
  name: string;
  description: string;
  icon: string;
  categories: string[];
  popularityRank: number;
  actions: PluginAction[];
  website: string;
  docsUrl: string;
}

/**
 * Registry vide — utilisez `plugin-engine/catalog.ts` à la place.
 * Les plugins de production avec actions réelles et validation Zod
 * sont gérés par le PluginEngine (src/lib/plugin-engine/).
 */
export const pluginRegistry: Record<string, Plugin> = {};

export const getPlugin = (id: string): Plugin | null => pluginRegistry[id] || null;

/**
 * Version async — préférer importer directement plugin-engine.
 * Retourne [] en synchrone pour compatibilité.
 */
export const getTopPlugins = (_limit = 50): Plugin[] => {
  return [];
};

export const searchPlugins = (_query: string, _category?: string): Plugin[] => {
  return [];
};

export default pluginRegistry;
