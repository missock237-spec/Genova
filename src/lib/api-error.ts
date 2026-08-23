// ============================================================
// Gen3ia — API Error compatibility shim
// ============================================================
//  Source canonique des erreurs : src/lib/errors.ts -> packages/core/src/errors.ts
//
//  Ce fichier préserve l'API historique de '@/lib/api-error' :
//    - ErrorCode / ErrorCodeType
//    - errorResponse(error, code, status, details)
//    - successResponse(data, status)
//    - ApiError(message, code, statusCode, details)
//    - handleApiError(error)
//
//  IMPORTANT : le constructeur legacy ApiError garde l'ordre historique
//  (message, code, statusCode), différent du ApiError canonique core
//  (code, message, statusCode). Ne pas le remplacer par un export direct.
//
//  Objectif : réduire la duplication sans casser les routes existantes qui
//  consomment encore le format plat { success, error: string, code }.
// ============================================================

import { NextResponse } from 'next/server';
import {
  ApiError as CoreApiError,
  ErrorCodes as CoreErrorCodes,
  handleApiError as handleCoreApiError,
} from '@/lib/errors';

export type {
  ApiSuccessResponse as CoreApiSuccessResponse,
  ApiErrorResponse as CoreApiErrorResponse,
  ApiResponse as CoreApiResponse,
} from '@/lib/errors';

/**
 * Codes d'erreur legacy exposés par '@/lib/api-error'.
 *
 * Gardés pour compatibilité avec les routes existantes. Les valeurs qui ont
 * un équivalent canonique pointent vers CoreErrorCodes pour éviter une
 * deuxième source de vérité silencieuse.
 */
export const ErrorCode = {
  UNAUTHORIZED: CoreErrorCodes.UNAUTHORIZED,
  FORBIDDEN: CoreErrorCodes.FORBIDDEN,
  NOT_FOUND: CoreErrorCodes.NOT_FOUND,
  VALIDATION_ERROR: CoreErrorCodes.VALIDATION_ERROR,
  RATE_LIMITED: CoreErrorCodes.RATE_LIMIT_EXCEEDED,
  INSUFFICIENT_CREDITS: CoreErrorCodes.INSUFFICIENT_CREDITS,
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  CONFLICT: 'CONFLICT',
  BAD_REQUEST: 'BAD_REQUEST',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTEGRATION_ERROR: 'INTEGRATION_ERROR',
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];

export interface ApiErrorResponse {
  success: false;
  error: string;
  code: ErrorCodeType | string;
  details?: Record<string, unknown>;
}

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  code?: string;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Convertit une réponse d'erreur canonique core en format legacy plat.
 */
async function flattenCoreErrorResponse(
  response: NextResponse
): Promise<NextResponse<ApiErrorResponse>> {
  try {
    const payload = await response.clone().json() as {
      success?: false;
      error?: { code?: string; message?: string; details?: Record<string, unknown> } | string;
      code?: string;
    };

    if (payload && typeof payload.error === 'object' && payload.error !== null) {
      return NextResponse.json(
        {
          success: false,
          error: payload.error.message || 'Erreur interne du serveur',
          code: payload.error.code || payload.code || ErrorCode.INTERNAL_ERROR,
          ...(payload.error.details ? { details: payload.error.details } : {}),
        },
        { status: response.status },
      );
    }

    if (payload && typeof payload.error === 'string') {
      return NextResponse.json(
        {
          success: false,
          error: payload.error,
          code: payload.code || ErrorCode.INTERNAL_ERROR,
        },
        { status: response.status },
      );
    }
  } catch {
    // Si le corps core n'est pas JSON, on retombe sur une erreur legacy générique.
  }

  return NextResponse.json(
    { success: false, error: 'Erreur interne du serveur', code: ErrorCode.INTERNAL_ERROR },
    { status: response.status || 500 },
  );
}

/**
 * Retourne une réponse d'erreur standardisée au format legacy.
 *
 * @deprecated Préférer '@/lib/errors' pour le contrat canonique
 * { success:false, error:{ code, message, details, requestId } }.
 */
export function errorResponse(
  error: string,
  code: ErrorCodeType = ErrorCode.INTERNAL_ERROR,
  status: number = 500,
  details?: Record<string, unknown>
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      success: false,
      error,
      code,
      ...(details ? { details } : {}),
    },
    { status },
  );
}

/**
 * Retourne une réponse de succès standardisée au format legacy.
 *
 * @deprecated Préférer un contrat API unique basé sur '@/lib/errors'.
 */
export function successResponse<T>(
  data: T,
  status: number = 200
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
    },
    { status },
  );
}

/**
 * Erreur API legacy avec ordre de paramètres historique.
 *
 * @deprecated Utiliser ApiError depuis '@/lib/errors' :
 * `new CoreApiError(code, message, statusCode, details)`.
 */
export class ApiError extends Error {
  public code: ErrorCodeType | string;
  public statusCode: number;
  public details?: Record<string, unknown>;

  constructor(
    message: string,
    code: ErrorCodeType | string = ErrorCode.INTERNAL_ERROR,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  toCoreError(): CoreApiError {
    return new CoreApiError(this.code, this.message, this.statusCode, this.details);
  }

  toResponse(): NextResponse<ApiErrorResponse> {
    return errorResponse(this.message, this.code, this.statusCode, this.details);
  }
}

/**
 * Wrapper legacy pour handler les erreurs dans les routes API.
 *
 * Les ApiError legacy gardent leur ancien format plat. Les autres erreurs
 * passent par le handler canonique core puis sont aplaties pour préserver
 * le contrat historique de '@/lib/api-error'.
 *
 * @deprecated Préférer handleApiError depuis '@/lib/errors'.
 */
export function handleApiError(error: unknown): NextResponse<ApiErrorResponse> {
  if (error instanceof ApiError) {
    return error.toResponse();
  }

  if (error instanceof CoreApiError) {
    return errorResponse(error.message, error.code, error.statusCode, error.details);
  }

  // Compat spéciale conservée depuis l'ancien module.
  if (error instanceof Error) {
    if (
      error.name === 'FirebaseError' ||
      error.name === 'FirestoreError' ||
      error.message?.toLowerCase().includes('firestore') ||
      error.message?.toLowerCase().includes('firebase')
    ) {
      return errorResponse('Erreur de base de données', ErrorCode.INTERNAL_ERROR, 500);
    }
  }

  const coreResponse = handleCoreApiError(error);

  // NextResponse.json(...) est synchrone, mais lire le body ne l'est pas.
  // Pour préserver la signature sync legacy, on ne peut pas await ici.
  // On conserve donc le comportement historique pour les erreurs non typées.
  if (error instanceof Error) {
    return errorResponse(error.message, ErrorCode.INTERNAL_ERROR, 500);
  }

  void flattenCoreErrorResponse(coreResponse);
  return errorResponse('Erreur interne du serveur', ErrorCode.INTERNAL_ERROR, 500);
}
