/**
 * POST /api/ai-server/process — Full integration pipeline
 *
 * Accepts an open-source project's files and runs the complete pipeline:
 * Analyze → Generate → Register → Verify → Activate
 *
 * This is the main endpoint for auto-integrating a new open-source project.
 */

import { NextRequest, NextResponse } from 'next/server';
import { processProject, type CodeFile } from '@/lib/ai-integration-server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { projectName, repository, readmeContent, files, autoActivate, userId } = body as {
      projectName?: string;
      repository?: string;
      readmeContent?: string;
      files?: Array<{
        path: string;
        content: string;
        language?: CodeFile['language'];
      }>;
      autoActivate?: boolean;
      userId?: string;
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

    // Validate total file size
    const totalSize = files.reduce((sum: number, f: { content: string }) => sum + f.content.length, 0);
    if (totalSize > 10 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'Total file content exceeds 10MB limit' },
        { status: 400 },
      );
    }

    if (files.length > 100) {
      return NextResponse.json(
        { success: false, error: 'Too many files. Maximum 100 files per request.' },
        { status: 400 },
      );
    }

    const codeFiles: CodeFile[] = files.map((f: { path: string; content: string; language?: CodeFile['language'] }) => ({
      path: f.path,
      content: f.content,
      language: f.language || 'unknown',
    }));

    const result = await processProject({
      files: codeFiles,
      projectName,
      repository,
      readmeContent,
      autoActivate: autoActivate ?? false,
      userId,
    });

    const statusCode = result.success ? 200 : 422;

    return NextResponse.json({
      success: result.success,
      data: result.success ? {
        projectName: result.projectName,
        registrationStatus: result.registrationStatus,
        activationStatus: result.activationStatus,
        analysis: {
          projectType: result.analysis.projectType,
          primaryLanguage: result.analysis.primaryLanguage,
          frameworks: result.analysis.frameworks,
          apis: result.analysis.apis,
          models: result.analysis.models,
          integrationPoints: result.analysis.integrationPoints,
          fallbackSuggestions: result.analysis.fallbackSuggestions,
          healthCheckStrategy: result.analysis.healthCheckStrategy,
          readinessScore: result.analysis.readinessScore,
          analysisConfidence: result.analysis.analysisConfidence,
          codePatterns: result.analysis.codePatterns,
        },
        generation: {
          adapter: {
            fileName: result.generation.adapter?.fileName,
            filePath: result.generation.adapter?.filePath,
            content: result.generation.adapter?.content,
            description: result.generation.adapter?.description,
          },
          apiRoutes: result.generation.apiRoutes?.map(r => ({
            filePath: r.filePath,
            description: r.description,
            content: r.content,
          })),
          config: result.generation.config,
          warnings: result.generation.warnings,
          instructions: result.generation.instructions,
        },
        healthReport: result.healthReport ? {
          overallHealth: result.healthReport.overallHealth,
          status: result.healthReport.status,
          summary: result.healthReport.summary,
          aiRecommendations: result.healthReport.aiRecommendations,
        } : undefined,
        totalDurationMs: result.totalDurationMs,
      } : { error: result.error },
    }, { status: statusCode });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Processing failed' },
      { status: 500 },
    );
  }
}
