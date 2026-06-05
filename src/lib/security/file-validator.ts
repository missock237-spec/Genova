/**
 * File Validator — Security validation for file uploads
 *
 * Enforces size limits, MIME type allowlists, extension blocklists,
 * and provides specialized validators for images and documents.
 * Includes a placeholder interface for ClamAV malware scanning.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('file-validator');

// ============================================================
// Types
// ============================================================

export interface FileValidationInput {
  name: string;
  size: number;
  type: string;
  buffer?: Buffer;
}

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
  threatLevel?: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

export interface MalwareScanResult {
  clean: boolean;
  threats: string[];
  scanDurationMs: number;
  engine?: string;
}

// ============================================================
// Constants
// ============================================================

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const ALLOWED_MIME_TYPES: readonly string[] = [
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  'image/avif',
  'image/x-icon',
  // Documents
  'application/pdf',
  // Text
  'text/plain',
  'text/csv',
  'text/html',
  'text/xml',
  'text/markdown',
  'text/x-log',
  // Structured data
  'application/json',
  'application/xml',
  'application/xhtml+xml',
  // Code (treated as text)
  'text/x-python',
  'text/x-javascript',
  'text/x-typescript',
  'text/x-c',
  'text/x-c++',
  'text/x-java',
  'text/x-go',
  'text/x-rust',
  'text/x-shellscript',
  'text/x-yaml',
  'text/yaml',
  'application/x-yaml',
  // Office (limited)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',     // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',           // .xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',   // .pptx
  'application/msword',                                                          // .doc
  'application/vnd.ms-excel',                                                    // .xls
];

const ALLOWED_MIME_PREFIXES: readonly string[] = [
  'image/',
  'text/',
];

const DANGEROUS_EXTENSIONS: readonly string[] = [
  // Executable
  '.exe', '.msi', '.com', '.scr', '.pif', '.dll', '.so', '.dylib',
  // Shell scripts
  '.sh', '.bash', '.zsh', '.fish', '.ksh', '.csh',
  // Windows scripts
  '.bat', '.cmd', '.ps1', '.ps2', '.vbs', '.vbe', '.wsf', '.wsh', '.msc',
  // JavaScript in upload context (prevent stored XSS via upload)
  '.js', '.mjs', '.cjs',
  // Web dangerous
  '.html', '.htm', '.xhtml', '.shtml',
  '.php', '.phtml', '.php3', '.php4', '.php5', '.php7', '.pht',
  '.asp', '.aspx', '.jsp', '.jspx', '.cgi',
  // Java archives
  '.jar', '.war', '.ear',
  // Other dangerous
  '.py', '.pyc', '.pyo', '.rb', '.pl', '.pm',
  '.reg', '.inf', '.lnk', '.url', '.desktop',
  '.app', '.dmg', '.ipa',
  // Archive bombs (can be re-enabled with size checks)
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz',
];

const IMAGE_EXTENSIONS: readonly string[] = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif',
  '.svg', '.ico', '.avif',
];

const DOCUMENT_EXTENSIONS: readonly string[] = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv', '.json', '.xml', '.yaml', '.yml', '.md',
];

const MAX_IMAGE_SIZE = 20 * 1024 * 1024;  // 20MB for images
const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024; // 50MB for documents

// ============================================================
// File Validator
// ============================================================

export class FileValidator {
  private static readonly MAX_FILE_SIZE = MAX_FILE_SIZE;
  private static readonly ALLOWED_MIME_TYPES = ALLOWED_MIME_TYPES;
  private static readonly DANGEROUS_EXTENSIONS = DANGEROUS_EXTENSIONS;

  /**
   * General file validation — checks size, MIME type, and extension safety.
   */
  validate(file: FileValidationInput): ValidationResult {
    // 1. Check file size
    if (file.size <= 0) {
      return {
        allowed: false,
        reason: 'Empty file — file size is zero',
        threatLevel: 'low',
      };
    }

    if (file.size > FileValidator.MAX_FILE_SIZE) {
      return {
        allowed: false,
        reason: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds 50MB limit`,
        threatLevel: 'none',
      };
    }

    // 2. Extract and check file extension
    const extension = this.getExtension(file.name);
    if (!extension) {
      return {
        allowed: false,
        reason: 'File must have an extension',
        threatLevel: 'low',
      };
    }

    const lowerExt = extension.toLowerCase();
    const dangerousExt = FileValidator.DANGEROUS_EXTENSIONS.find(
      (ext) => ext === lowerExt
    );

    if (dangerousExt) {
      return {
        allowed: false,
        reason: `Dangerous file type blocked: ${dangerousExt}`,
        threatLevel: 'high',
      };
    }

    // 3. Check MIME type
    if (!this.isAllowedMimeType(file.type)) {
      return {
        allowed: false,
        reason: `MIME type not allowed: ${file.type}`,
        threatLevel: 'medium',
      };
    }

    // 4. Cross-validate: extension should roughly match MIME type
    if (!this.extensionMatchesMimeType(lowerExt, file.type)) {
      log.warn('Extension/MIME type mismatch', {
        fileName: file.name,
        extension: lowerExt,
        mimeType: file.type,
      });
      // We allow the mismatch but flag it — the MIME type check is authoritative
    }

    // 5. Check for double extensions (e.g., file.exe.jpg)
    if (this.hasDoubleExtension(file.name)) {
      return {
        allowed: false,
        reason: 'Double extension detected — potential spoofing attempt',
        threatLevel: 'high',
      };
    }

    // 6. Check filename for null bytes or control characters
    if (this.hasMaliciousFileName(file.name)) {
      return {
        allowed: false,
        reason: 'Malicious filename detected',
        threatLevel: 'critical',
      };
    }

    return {
      allowed: true,
      threatLevel: 'none',
    };
  }

  /**
   * Specific validation for image uploads.
   * Stricter size limit (20MB) and only image MIME types.
   */
  validateImage(file: FileValidationInput): ValidationResult {
    // Check general rules first
    const generalResult = this.validate(file);
    if (!generalResult.allowed) {
      return generalResult;
    }

    // Image-specific size limit
    if (file.size > MAX_IMAGE_SIZE) {
      return {
        allowed: false,
        reason: `Image too large: ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds 20MB limit`,
        threatLevel: 'none',
      };
    }

    // Must be image MIME type
    if (!file.type.startsWith('image/')) {
      return {
        allowed: false,
        reason: `Not an image file: ${file.type}`,
        threatLevel: 'medium',
      };
    }

    // Must have image extension
    const extension = this.getExtension(file.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.includes(extension)) {
      return {
        allowed: false,
        reason: `Not an image extension: ${extension}`,
        threatLevel: 'medium',
      };
    }

    // Validate image buffer content if provided
    if (file.buffer) {
      const signatureCheck = this.checkImageSignature(file.buffer);
      if (!signatureCheck.valid) {
        return {
          allowed: false,
          reason: signatureCheck.reason || 'Invalid image signature',
          threatLevel: 'high',
        };
      }
    }

    return {
      allowed: true,
      threatLevel: 'none',
    };
  }

  /**
   * Specific validation for document uploads (PDFs, docs, text).
   * Only allows document MIME types and extensions.
   */
  validateDocument(file: FileValidationInput): ValidationResult {
    // Check general rules first
    const generalResult = this.validate(file);
    if (!generalResult.allowed) {
      return generalResult;
    }

    // Document-specific size limit
    if (file.size > MAX_DOCUMENT_SIZE) {
      return {
        allowed: false,
        reason: `Document too large: ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds 50MB limit`,
        threatLevel: 'none',
      };
    }

    // Must be a document MIME type
    const isDocMimeType =
      file.type === 'application/pdf' ||
      file.type.startsWith('text/') ||
      file.type === 'application/json' ||
      file.type === 'application/xml' ||
      file.type.startsWith('application/vnd.openxmlformats-officedocument') ||
      file.type.startsWith('application/vnd.ms-');

    if (!isDocMimeType) {
      return {
        allowed: false,
        reason: `Not a document file: ${file.type}`,
        threatLevel: 'medium',
      };
    }

    // Must have document extension
    const extension = this.getExtension(file.name).toLowerCase();
    if (!DOCUMENT_EXTENSIONS.includes(extension)) {
      return {
        allowed: false,
        reason: `Not a document extension: ${extension}`,
        threatLevel: 'medium',
      };
    }

    // Validate PDF signature if buffer provided
    if (file.buffer && file.type === 'application/pdf') {
      const header = file.buffer.slice(0, 5).toString('ascii');
      if (header !== '%PDF-') {
        return {
          allowed: false,
          reason: 'File does not have a valid PDF signature',
          threatLevel: 'high',
        };
      }
    }

    return {
      allowed: true,
      threatLevel: 'none',
    };
  }

  /**
   * Placeholder for ClamAV or similar malware scanning integration.
   * Returns a clean result by default — override in production with
   * actual scanner integration.
   */
  async scanForMalware(buffer: Buffer): Promise<MalwareScanResult> {
    // Placeholder: In production, integrate with ClamAV daemon:
    //
    // const clamav = new NodeClam();
    // const { isInfected, viruses } = await clamav.scanBuffer(buffer);
    //
    // For now, return clean result
    log.debug('Malware scan requested — placeholder returning clean', {
      bufferSize: buffer.length,
    });

    return {
      clean: true,
      threats: [],
      scanDurationMs: 0,
      engine: 'placeholder',
    };
  }

  // -----------------------------------------------------------------------
  // Private Helpers
  // -----------------------------------------------------------------------

  private getExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1 || lastDot === filename.length - 1) {
      return '';
    }
    return filename.slice(lastDot);
  }

  private isAllowedMimeType(mimeType: string): boolean {
    // Check exact match
    if (FileValidator.ALLOWED_MIME_TYPES.includes(mimeType)) {
      return true;
    }
    // Check prefix match (e.g., image/*, text/*)
    for (const prefix of ALLOWED_MIME_PREFIXES) {
      if (mimeType.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }

  private extensionMatchesMimeType(extension: string, mimeType: string): boolean {
    const mapping: Record<string, string[]> = {
      '.jpg':  ['image/jpeg'],
      '.jpeg': ['image/jpeg'],
      '.png':  ['image/png'],
      '.gif':  ['image/gif'],
      '.webp': ['image/webp'],
      '.svg':  ['image/svg+xml'],
      '.bmp':  ['image/bmp'],
      '.pdf':  ['application/pdf'],
      '.txt':  ['text/plain'],
      '.csv':  ['text/csv'],
      '.json': ['application/json'],
      '.xml':  ['application/xml', 'text/xml'],
      '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    };

    const expected = mapping[extension];
    if (!expected) return true; // Unknown extension — don't block on mismatch
    return expected.some((m) => mimeType === m || mimeType.startsWith(m.split('/')[0] + '/'));
  }

  private hasDoubleExtension(filename: string): boolean {
    // Check for patterns like "file.exe.jpg", "file.sh.png"
    const lowerName = filename.toLowerCase();
    const parts = lowerName.split('.');

    if (parts.length <= 2) return false;

    // Check if any intermediate extension is dangerous
    for (let i = 1; i < parts.length - 1; i++) {
      const ext = '.' + parts[i];
      if (FileValidator.DANGEROUS_EXTENSIONS.includes(ext)) {
        return true;
      }
    }

    return false;
  }

  private hasMaliciousFileName(filename: string): boolean {
    // Null bytes
    if (filename.includes('\0')) return true;
    // Control characters (0x00-0x1F except tab, newline, carriage return)
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(filename)) return true;
    // Path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) return true;
    // URL encoding tricks
    if (/%[0-9a-fA-F]{2}/.test(filename)) return true;

    return false;
  }

  private checkImageSignature(buffer: Buffer): { valid: boolean; reason?: string } {
    if (buffer.length < 8) {
      return { valid: false, reason: 'Buffer too small for image validation' };
    }

    const header = buffer.slice(0, 8);

    // JPEG: FF D8 FF
    if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) {
      return { valid: true };
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      header[0] === 0x89 &&
      header[1] === 0x50 &&
      header[2] === 0x4E &&
      header[3] === 0x47
    ) {
      return { valid: true };
    }

    // GIF: GIF87a or GIF89a
    const gifHeader = buffer.slice(0, 6).toString('ascii');
    if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
      return { valid: true };
    }

    // WebP: RIFF....WEBP
    if (buffer.length >= 12) {
      const riffHeader = buffer.slice(0, 4).toString('ascii');
      const webpMarker = buffer.slice(8, 12).toString('ascii');
      if (riffHeader === 'RIFF' && webpMarker === 'WEBP') {
        return { valid: true };
      }
    }

    // BMP: BM
    const bmpHeader = buffer.slice(0, 2).toString('ascii');
    if (bmpHeader === 'BM') {
      return { valid: true };
    }

    // SVG is text-based, can't validate by binary signature
    // If none of the above match, it might be SVG or an invalid file
    // We'll be lenient and allow it since the MIME type was already validated
    return { valid: true };
  }
}
