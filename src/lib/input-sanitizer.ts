// Input Sanitizer — Comprehensive input sanitization utilities
// Provides protection against XSS, injection, directory traversal, and more.
import { PromptValidator } from '@/lib/security/prompt-validator';

const promptValidator = new PromptValidator();

/**
 * Strip all HTML tags, keep only text content.
 * Removes script, style, and all other tags including their content for dangerous ones.
 */
export function sanitizeHtml(input: string): string {
  if (typeof input !== 'string') return '';

  let sanitized = input;

  // Remove script tags and their content entirely
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove style tags and their content entirely
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Remove event handler attributes (on*)
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');

  // Remove all remaining HTML tags, keep only text content
  sanitized = sanitized.replace(/<[^>]*>/g, '');

  // Decode common HTML entities
  sanitized = sanitized
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');

  // Strip null bytes and control characters
  sanitized = stripNullBytes(sanitized);

  return sanitized.trim();
}

/**
 * Validate and sanitize URLs.
 * Rejects javascript:, data:, vbscript: protocols.
 */
export function sanitizeUrl(url: string): string {
  if (typeof url !== 'string') return '';

  const trimmed = url.trim();

  // Check for dangerous protocols (case-insensitive)
  const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'blob:'];
  const protocolMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);

  if (protocolMatch) {
    const protocol = protocolMatch[1].toLowerCase();
    if (dangerousProtocols.includes(protocol + ':')) {
      return '';
    }
  }

  // Only allow http, https, mailto, tel, ftp protocols
  const allowedProtocols = ['http', 'https', 'mailto', 'tel', 'ftp'];
  if (protocolMatch) {
    const protocol = protocolMatch[1].toLowerCase();
    if (!allowedProtocols.includes(protocol)) {
      return '';
    }
  }

  // Strip null bytes and control characters
  const sanitized = stripNullBytes(trimmed);

  // Remove whitespace that could be used for smuggling
  return sanitized.replace(/[\r\n\t]/g, '');
}

/**
 * Validate JSON input.
 * Rejects overly nested objects (max 10 levels).
 */
export function sanitizeJson(input: unknown, maxDepth: number = 10): { valid: boolean; data: unknown; error?: string } {
  if (input === null || input === undefined) {
    return { valid: true, data: input };
  }

  // If it's a string, try to parse it
  let parsed: unknown;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch {
      return { valid: false, data: null, error: 'Invalid JSON format' };
    }
  } else {
    parsed = input;
  }

  // Check nesting depth
  const depth = measureDepth(parsed);
  if (depth > maxDepth) {
    return { valid: false, data: null, error: `JSON nesting exceeds maximum depth of ${maxDepth}` };
  }

  // Check for prototype pollution patterns
  if (typeof parsed === 'object' && parsed !== null) {
    const pollutionCheck = checkPrototypePollution(parsed as Record<string, unknown>);
    if (!pollutionCheck.safe) {
      return { valid: false, data: null, error: pollutionCheck.reason };
    }
  }

  return { valid: true, data: parsed };
}

/**
 * Measure the maximum nesting depth of a JSON object.
 */
function measureDepth(obj: unknown, currentDepth: number = 0): number {
  if (obj === null || typeof obj !== 'object') {
    return currentDepth;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return currentDepth + 1;
    return Math.max(...obj.map((item) => measureDepth(item, currentDepth + 1)));
  }

  const entries = Object.entries(obj as Record<string, unknown>);
  if (entries.length === 0) return currentDepth + 1;
  return Math.max(
    ...entries.map(([, value]) => measureDepth(value, currentDepth + 1))
  );
}

/**
 * Check for prototype pollution patterns in an object.
 */
function checkPrototypePollution(
  obj: Record<string, unknown>,
  visited: Set<unknown> = new Set()
): { safe: boolean; reason?: string } {
  if (visited.has(obj)) return { safe: true }; // Circular reference, skip
  visited.add(obj);

  const dangerousKeys = ['__proto__', 'constructor', 'prototype'];

  for (const key of Object.keys(obj)) {
    if (dangerousKeys.includes(key)) {
      return {
        safe: false,
        reason: `Dangerous key "${key}" detected — potential prototype pollution`,
      };
    }

    const value = obj[key];
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const nestedCheck = checkPrototypePollution(value as Record<string, unknown>, visited);
      if (!nestedCheck.safe) return nestedCheck;
    }
  }

  return { safe: true };
}

/**
 * Sanitize filenames to prevent directory traversal.
 * Removes path separators, null bytes, and other dangerous characters.
 */
export function sanitizeFilename(filename: string): string {
  if (typeof filename !== 'string') return '';

  let sanitized = filename;

  // Remove null bytes
  sanitized = stripNullBytes(sanitized);

  // Remove path separators and traversal patterns
  sanitized = sanitized.replace(/[\/\\]/g, '');
  sanitized = sanitized.replace(/\.\./g, '');

  // Remove leading dots (hidden files)
  sanitized = sanitized.replace(/^\.+/g, '');

  // Remove any character that's not alphanumeric, dash, underscore, dot, or space
  sanitized = sanitized.replace(/[^a-zA-Z0-9._\-\s]/g, '');

  // Limit length
  if (sanitized.length > 255) {
    const ext = sanitized.lastIndexOf('.');
    if (ext > 0 && ext > sanitized.length - 10) {
      // Preserve extension
      const baseName = sanitized.substring(0, 245);
      const extension = sanitized.substring(ext);
      sanitized = baseName + extension;
    } else {
      sanitized = sanitized.substring(0, 255);
    }
  }

  return sanitized.trim();
}

/**
 * Remove null bytes and control characters from a string.
 */
export function stripNullBytes(input: string): string {
  if (typeof input !== 'string') return '';

  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');

  // Remove other control characters (0x01-0x1F, 0x7F) except tab, newline, carriage return
  sanitized = sanitized.replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return sanitized;
}

/**
 * Prevent NoSQL injection patterns.
 * Escapes or removes MongoDB-style operators and patterns.
 */
export function escapeForDb(input: string): string {
  if (typeof input !== 'string') return '';

  let sanitized = input;

  // Remove MongoDB-style operators
  sanitized = sanitized.replace(/\$/g, '');
  sanitized = sanitized.replace(/\{[^}]*\$/g, '');

  // Remove NoSQL injection patterns
  sanitized = sanitized.replace(/\$where/gi, '');
  sanitized = sanitized.replace(/\$gt/gi, '');
  sanitized = sanitized.replace(/\$lt/gi, '');
  sanitized = sanitized.replace(/\$ne/gi, '');
  sanitized = sanitized.replace(/\$eq/gi, '');
  sanitized = sanitized.replace(/\$in/gi, '');
  sanitized = sanitized.replace(/\$regex/gi, '');
  sanitized = sanitized.replace(/\$or/gi, '');
  sanitized = sanitized.replace(/\$and/gi, '');
  sanitized = sanitized.replace(/\$not/gi, '');

  // Strip null bytes
  sanitized = stripNullBytes(sanitized);

  return sanitized;
}

/**
 * Validate API key format.
 * Only allows alphanumeric characters, dashes, and underscores.
 */
export function validateApiKey(key: string): { valid: boolean; error?: string } {
  if (typeof key !== 'string') {
    return { valid: false, error: 'API key must be a string' };
  }

  if (key.length === 0) {
    return { valid: false, error: 'API key cannot be empty' };
  }

  if (key.length > 512) {
    return { valid: false, error: 'API key is too long (max 512 characters)' };
  }

  // Only allow alphanumeric, dashes, underscores, and dots
  const validPattern = /^[a-zA-Z0-9._-]+$/;
  if (!validPattern.test(key)) {
    return { valid: false, error: 'API key contains invalid characters. Only alphanumeric, dashes, underscores, and dots are allowed.' };
  }

  return { valid: true };
}

/**
 * Enhanced prompt sanitization.
 * Extends existing PromptValidator with additional sanitization steps.
 */
export function sanitizePrompt(input: string): string {
  if (typeof input !== 'string') return '';

  let sanitized = input;

  // First, use the existing PromptValidator for injection detection
  const validation = promptValidator.validatePrompt(sanitized);

  // Use the PromptValidator's sanitized version as the base
  sanitized = validation.sanitizedPrompt;

  // Additional sanitization steps:

  // Strip null bytes and control characters
  sanitized = stripNullBytes(sanitized);

  // Remove HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, '');

  // Remove potential ANSI escape sequences
  sanitized = sanitized.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

  // Remove potential Unicode bidirectional override characters
  sanitized = sanitized.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');

  // Remove zero-width characters
  sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // Trim excessive whitespace
  sanitized = sanitized.replace(/\s{3,}/g, ' ').trim();

  return sanitized;
}
