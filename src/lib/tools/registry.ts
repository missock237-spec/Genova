// Tool Registry — Registration, discovery, and execution of agent tools

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required: boolean }>;
  execute: (params: Record<string, unknown>, context: ToolExecutionContext) => Promise<unknown>;
  isDangerous?: boolean;
  category: 'search' | 'compute' | 'data' | 'communication' | 'file' | 'browser';
}

export interface ToolExecutionContext {
  userId: string;
  agentId: string;
  conversationId?: string;
  sandbox: boolean;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  /**
   * Register a tool
   */
  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Get a tool by name
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Execute a tool by name with given parameters
   */
  async execute(
    name: string,
    params: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<{ success: boolean; result: unknown; error?: string }> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, result: null, error: `Outil "${name}" non trouvé` };
    }

    // Validate required parameters
    for (const [paramName, paramDef] of Object.entries(tool.parameters)) {
      if (paramDef.required && !(paramName in params)) {
        return {
          success: false,
          result: null,
          error: `Paramètre requis manquant: ${paramName}`,
        };
      }
    }

    // Check sandbox restrictions for dangerous tools
    if (tool.isDangerous && context.sandbox) {
      return {
        success: false,
        result: null,
        error: `Outil "${name}" non disponible en mode bac à sable`,
      };
    }

    try {
      const result = await tool.execute(params, context);
      return { success: true, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur d\'exécution de l\'outil';
      return { success: false, result: null, error: message };
    }
  }

  /**
   * Get all registered tools
   */
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getByCategory(category: string): ToolDefinition[] {
    return this.getAll().filter(t => t.category === category);
  }

  /**
   * Get tool descriptions formatted for LLM prompt
   */
  getToolDescriptions(): string {
    return this.getAll()
      .map(tool => {
        const params = Object.entries(tool.parameters)
          .map(([name, def]) => `    - ${name} (${def.type}${def.required ? ', requis' : ', optionnel'}): ${def.description}`)
          .join('\n');
        return `${tool.name}${tool.isDangerous ? ' [DANGEREUX]' : ''}: ${tool.description}\n  Paramètres:\n${params}`;
      })
      .join('\n\n');
  }

  /**
   * Get tool names as an array
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }
}
