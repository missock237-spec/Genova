/**
 * POST /api/integrations/scan — Scan an open-source project
 *
 * Analyzes a project directory or provided metadata to detect
 * capabilities, functions, and integration requirements.
 */

import { NextRequest, NextResponse } from 'next/server';
import { scanProject, type ScanOptions } from '@/lib/integration-engine/scanner';
import { getIntegrationRegistry } from '@/lib/integration-engine/registry';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const options: ScanOptions = {
      projectName: body.projectName,
      readmeContent: body.readmeContent,
      packageJson: body.packageJson,
      requirementsTxt: body.requirementsTxt,
      setupPy: body.setupPy,
      envExample: body.envExample,
      keywords: body.keywords,
      repository: body.repository,
      homepage: body.homepage,
    };

    if (!options.projectName && !options.packageJson && !options.readmeContent) {
      return NextResponse.json(
        { success: false, error: 'Provide at least projectName, packageJson, or readmeContent' },
        { status: 400 },
      );
    }

    const scanResult = await scanProject(options);

    // If readiness score is high enough, auto-register as discovered
    if (scanResult.readinessScore >= 40 && scanResult.detectedFunctions.length > 0) {
      const registry = getIntegrationRegistry();
      const existingIntegration = registry.getById(scanResult.projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-'));

      if (!existingIntegration) {
        // Auto-register with discovered status
        const config = {
          id: scanResult.projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
          name: scanResult.projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
          displayName: scanResult.projectName,
          description: scanResult.description || `Auto-detected integration for ${scanResult.projectName}`,
          version: scanResult.version,
          category: scanResult.detectedCategory,
          icon: getCategoryIcon(scanResult.detectedCategory),
          color: getCategoryColor(scanResult.detectedCategory),
          homepage: scanResult.homepage || '',
          repository: scanResult.repository || '',
          status: 'discovered' as const,
          functions: scanResult.detectedFunctions.map(f => ({
            ...f,
            id: f.id || `${scanResult.projectName.toLowerCase()}-${f.name}`,
          })),
          dependencies: scanResult.dependencies,
          envVariables: scanResult.detectedEnvVars,
          metadata: {
            ...scanResult.metadata,
            readinessScore: scanResult.readinessScore,
            issues: scanResult.issues,
            autoRegistered: true,
          },
        };

        // Register as a generic adapter
        registry.register({
          config,
          initialize: async () => {},
          execute: async (functionId: string, params: Record<string, unknown>) => ({
            success: false,
            error: `Integration not yet activated. Activate ${scanResult.projectName} to enable this function.`,
            executionTimeMs: 0,
            provider: config.id,
            costUsd: 0,
            metadata: {},
          }),
          healthCheck: async () => ({
            healthy: false,
            responseTimeMs: 0,
            error: 'Not yet activated',
            checkedAt: new Date(),
          }),
          shutdown: async () => {},
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: scanResult,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Scan failed' },
      { status: 500 },
    );
  }
}

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    ai_ml: '🤖',
    communication: '💬',
    automation: '🔄',
    database: '🗄️',
    media: '🎨',
    infrastructure: '🔧',
    analytics: '📊',
    other: '📦',
  };
  return icons[category] || '📦';
}

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    ai_ml: '#8B5CF6',
    communication: '#25D366',
    automation: '#FF6D5A',
    database: '#3B82F6',
    media: '#F59E0B',
    infrastructure: '#6B7280',
    analytics: '#10B981',
    other: '#6B7280',
  };
  return colors[category] || '#6B7280';
}
