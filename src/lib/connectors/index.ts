/**
 * Connectors Module — Genova Connector System
 *
 * Main entry point for the MCP Connector and Access Key system.
 * Provides unified access to both connector types for the SaaS.
 */

// MCP Client
export {
  MCPClient,
  getMCPClientManager,
  encryptAuthConfig,
  decryptAuthConfig,
} from './mcp-client';

export type {
  MCPTool,
  MCPResource,
  MCPPrompt,
  MCPCapabilities,
  MCPServerInfo,
  MCPConnectionConfig,
  MCPExecutionResult,
} from './mcp-client';

// Access Key Manager
export {
  getAccessKeyManager,
  SERVICE_REGISTRY,
  getServiceDefinition,
} from './access-key-manager';

export type {
  AccessKeyType,
  CreateAccessKeyInput,
  UpdateAccessKeyInput,
  AccessKeyTestResult,
  AccessKeyExecutionResult,
  AccessKeySummary,
  ServiceDefinition,
} from './access-key-manager';

// Connector Registry
export {
  getConnectorRegistry,
} from './connector-registry';

export type {
  ConnectorType,
  ConnectorSummary,
  ConnectorStats,
  AgentToolDescriptor,
} from './connector-registry';
