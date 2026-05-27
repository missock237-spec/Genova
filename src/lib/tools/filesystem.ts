// Filesystem Tool — Sandboxed read-only file operations

import type { ToolDefinition } from './registry';
import { readFile, readdir } from 'fs/promises';
import { join, normalize, extname } from 'path';

// Allowed directories for reading
const ALLOWED_DIRS = [
  '/home/z/my-project/src',
  '/home/z/my-project/prisma',
  '/home/z/my-project/public',
];

// Blocked file extensions (binary files)
const BLOCKED_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot',
  '.mp3', '.mp4', '.avi', '.mov',
  '.zip', '.tar', '.gz', '.rar',
  '.exe', '.dll', '.so', '.dylib',
  '.db', '.sqlite', '.sqlite3',
];

function isPathAllowed(filePath: string): boolean {
  const normalized = normalize(filePath);
  return ALLOWED_DIRS.some(dir => normalized.startsWith(dir));
}

function isFileExtensionAllowed(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return !BLOCKED_EXTENSIONS.includes(ext);
}

export const filesystemTool: ToolDefinition = {
  name: 'filesystem',
  description: 'Lire des fichiers du répertoire projet. Lecture seule — ne peut pas écrire ou supprimer.',
  parameters: {
    operation: {
      type: 'string',
      description: 'Opération à effectuer: "read" pour lire un fichier, "list" pour lister un répertoire',
      required: true,
    },
    path: {
      type: 'string',
      description: 'Chemin du fichier ou répertoire (relatif au projet, ex: "src/lib/ai-router.ts")',
      required: true,
    },
  },
  category: 'file',
  isDangerous: true, // Requires guardrail check
  execute: async (params) => {
    const operation = params.operation as string;
    const relativePath = (params.path as string).replace(/^\//, '');

    // Resolve to absolute path
    const basePath = '/home/z/my-project';
    const absolutePath = join(basePath, relativePath);

    // Security: ensure the path is within allowed directories
    if (!isPathAllowed(absolutePath)) {
      throw new Error('Accès refusé: le chemin est en dehors des répertoires autorisés');
    }

    // Prevent path traversal
    if (absolutePath.includes('..')) {
      throw new Error('Accès refusé: traversal de répertoire non autorisé');
    }

    switch (operation) {
      case 'read': {
        if (!isFileExtensionAllowed(absolutePath)) {
          throw new Error('Type de fichier non supporté pour la lecture');
        }

        try {
          const content = await readFile(absolutePath, 'utf-8');
          // Limit file size to prevent huge outputs
          const truncated = content.length > 10000
            ? content.substring(0, 10000) + '\n... [fichier tronqué]'
            : content;

          return {
            path: relativePath,
            content: truncated,
            size: content.length,
            truncated: content.length > 10000,
          };
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(`Fichier non trouvé: ${relativePath}`);
          }
          if ((error as NodeJS.ErrnoException).code === 'EISDIR') {
            throw new Error(`Le chemin est un répertoire, pas un fichier. Utilisez l'opération "list" à la place.`);
          }
          throw new Error(`Erreur de lecture du fichier: ${(error as Error).message}`);
        }
      }

      case 'list': {
        try {
          const entries = await readdir(absolutePath, { withFileTypes: true });
          const listing = entries.map(entry => ({
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            extension: entry.isFile() ? extname(entry.name) : undefined,
          }));

          return {
            path: relativePath,
            entries: listing,
            count: listing.length,
          };
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(`Répertoire non trouvé: ${relativePath}`);
          }
          if ((error as NodeJS.ErrnoException).code === 'ENOTDIR') {
            throw new Error(`Le chemin est un fichier, pas un répertoire. Utilisez l'opération "read" à la place.`);
          }
          throw new Error(`Erreur de liste du répertoire: ${(error as Error).message}`);
        }
      }

      default:
        throw new Error(`Opération non supportée: ${operation}. Utilisez "read" ou "list".`);
    }
  },
};
