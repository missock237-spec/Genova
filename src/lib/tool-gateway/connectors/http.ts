/**
 * @module tool-gateway/connectors/http
 * @description Connecteur HTTP pour la passerelle d'outils Gen3ia.
 * Ce module implémente l'exécution de requêtes HTTP sortantes
 * avec gestion du délai d'attente et extraction des résultats.
 */

/**
 * Paramètres d'entrée pour une requête HTTP.
 * @interface HttpRequestInput
 * @property {string} url - URL cible de la requête
 * @property {string} [method] - Méthode HTTP (GET, POST, PUT, DELETE, PATCH)
 * @property {Record<string, string>} [headers] - En-têtes HTTP personnalisés
 * @property {string} [body] - Corps de la requête (texte ou JSON)
 */
interface HttpRequestInput {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Exécute une requête HTTP avec gestion du délai d'attente.
 * Le délai par défaut est de 20 secondes.
 *
 * @param {HttpRequestInput} input - Paramètres de la requête HTTP
 * @returns {Promise<Record<string, unknown>>} Objet contenant le statut, les en-têtes et le corps de la réponse
 * @throws {Error} Si l'URL est manquante, invalide, ou si la requête échoue
 *
 * @example
 * ```ts
 * const result = await executeHttpRequest({
 *   url: 'https://api.example.com/data',
 *   method: 'GET',
 *   headers: { 'Authorization': 'Bearer token123' },
 * });
 * console.log(result.status); // 200
 * console.log(result.body); // '{"key": "value"}'
 * ```
 */
export async function executeHttpRequest(
  input: HttpRequestInput,
): Promise<Record<string, unknown>> {
  const { url, method = 'GET', headers = {}, body } = input;

  if (!url || typeof url !== 'string') {
    throw new Error('Le paramètre "url" est requis et doit être une chaîne de caractères.');
  }

  // Validation basique de l'URL
  try {
    new URL(url);
  } catch {
    throw new Error(`URL invalide : "${url}"`);
  }

  // Vérification du protocole — uniquement http et https sont autorisés
  const parsedUrl = new URL(url);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(
      `Protocole non autorisé : "${parsedUrl.protocol}". Seuls http et https sont acceptés.`,
    );
  }

  // Délai d'attente de 20 secondes par défaut
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000);

  try {
    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };

    if (body && !['GET', 'HEAD'].includes(method.toUpperCase())) {
      fetchOptions.body = body;
    }

    const response = await fetch(url, fetchOptions);

    // Collecte des en-têtes de réponse
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    // Lecture du corps de la réponse
    const contentType = response.headers.get('content-type') ?? '';
    let responseBody: string;

    if (
      contentType.includes('application/json') ||
      contentType.includes('text/')
    ) {
      responseBody = await response.text();
    } else {
      // Pour les contenus binaires, retourner une représentation textuelle
      responseBody = `[Contenu binaire : ${contentType || 'inconnu'}, ${response.headers.get('content-length') ?? 'taille inconnue'} octets]`;
    }

    return {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`La requête HTTP vers "${url}" a expiré après 20 secondes.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
