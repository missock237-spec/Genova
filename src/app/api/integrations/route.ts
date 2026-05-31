/**
 * GET /api/integrations — List all integrations
 *
 * Returns all registered integrations with their status, functions,
 * and health check information.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getIntegrationRegistry } from '@/lib/integration-engine/registry';

export async function GET(request: NextRequest) {
  try {
    const registry = getIntegrationRegistry();
    const integrations = registry.getAll();

    // Group by category
    const byCategory: Record<string, typeof integrations> = {};
    for (const integration of integrations) {
      if (!byCategory[integration.category]) {
        byCategory[integration.category] = [];
      }
      byCategory[integration.category].push(integration);
    }

    // Summary stats
    const stats = {
      total: integrations.length,
      active: integrations.filter(i => i.status === 'active').length,
      inactive: integrations.filter(i => i.status === 'inactive').length,
      error: integrations.filter(i => i.status === 'error').length,
      discovered: integrations.filter(i => i.status === 'discovered').length,
      categories: Object.keys(byCategory).length,
      totalFunctions: integrations.reduce((sum, i) => sum + i.functions.length, 0),
    };

    return NextResponse.json({
      success: true,
      data: {
        integrations,
        byCategory,
        stats,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list integrations' },
      { status: 500 },
    );
  }
}
