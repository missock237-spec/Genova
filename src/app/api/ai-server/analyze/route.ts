/**
 * POST /api/ai-server/analyze — Analyze an open-source project's code
 *
 * Accepts project files and runs the AI-powered code analysis pipeline.
 * Returns structured analysis with detected APIs, models, integration points,
 * and configuration requirements.
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeCode, type CodeFile } from '@/lib/ai-integration-server/code-analyzer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { projectName, repository, readmeContent, files } = body as {
      projectName?: string;
      repository?: string;
      readmeContent?: string;
      files?: Array<{
        path: string;
        content: string;
        language?: CodeFile['language'];
      }>;
    };

    if (!projectName) {
      return NextResponse.json(
        { success: false, error: 'projectName is required' },
        { status: 400 },
      );
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'files array is required and must not be empty' },
        { status: 400 },
      );
    }

    // Validate file size (max 10MB total)
    const totalSize = files.reduce((sum: number, f: { content: string }) => sum + f.content.length, 0);
    if (totalSize > 10 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'Total file content exceeds 10MB limit' },
        { status: 400 },
      );
    }

    // Validate individual file count (max 100 files)
    if (files.length > 100) {
      return NextResponse.json(
        { success: false, error: 'Too many files. Maximum 100 files per analysis.' },
        { status: 400 },
      );
    }

    const codeFiles: CodeFile[] = files.map((f: { path: string; content: string; language?: CodeFile['language'] }) => ({
      path: f.path,
      content: f.content,
      language: f.language || 'unknown',
    }));

    const result = await analyzeCode({
      files: codeFiles,
      projectName,
      repository,
      readmeContent,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 },
    );
  }
}
