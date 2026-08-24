// ============================================================
// Plugin Engine — Point d'entrée
// ============================================================

export { listCatalog, getPluginDetail, executeAction, connectPlugin, disconnectPlugin } from './engine';
export { PLUGIN_CATALOG, PLUGIN_CATEGORIES, getTotalPluginCount, searchCatalog, getPlugin } from './catalog';
export { encryptCredentials, decryptCredentials, buildAuthHeaders } from './credentials';
export type * from './types';
