import { NextRequest, NextResponse } from 'next/server';
import { getAllowedOrigins } from '@/lib/security';

// Helper for server-side API responses with CORS
export function apiResponse(
  data: unknown,
  status: number = 200,
  request?: NextRequest
): NextResponse {
  const response = NextResponse.json(data, { status });
  if (request) {
    const origin = request.headers.get('origin') || undefined;
    const allowedOrigin = getAllowedOrigins(origin);
    if (allowedOrigin) {
      response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
    }
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  return response;
}

export function apiError(
  message: string,
  status: number = 500,
  request?: NextRequest
): NextResponse {
  return apiResponse({ error: message }, status, request);
}
