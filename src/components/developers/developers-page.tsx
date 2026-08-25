'use client';

import { lazy, Suspense } from 'react';
import { ApiKeysManager } from '@/components/api-keys/api-keys-manager';
import { MCPConnector } from '@/components/connectors/mcp-connector';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Key, Plug, BookOpen, Workflow, Loader2 } from 'lucide-react';

// Lazy-load AgentFlow : reactflow est lourd (~180 KB) et peut crasher
// en production (CSS manquant, bundling Edge, etc.). Le lazy + Suspense
// isole le crash au seul tab Architecture — les autres tabs restent OK.
const AgentFlow = lazy(() =>
  import('@/components/developers/agent-flow').then((m) => ({ default: m.AgentFlow }))
);

function ArchitectureFallback() {
  return (
    <div className="flex items-center justify-center py-20 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin mr-3" />
      Chargement du diagramme d'architecture...
    </div>
  );
}

export default function DevelopersPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Développeurs</h1>
        <p className="text-muted-foreground mt-2">
          Intégrez Gen3ia dans vos applications avec l&apos;API REST et les connecteurs MCP.
        </p>
      </div>

      <Tabs defaultValue="api-keys" className="space-y-6">
        <TabsList>
          <TabsTrigger value="api-keys" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            Clés API
          </TabsTrigger>
          <TabsTrigger value="mcp" className="flex items-center gap-2">
            <Plug className="h-4 w-4" />
            Connecteurs MCP
          </TabsTrigger>
          <TabsTrigger value="docs" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Documentation
          </TabsTrigger>
          <TabsTrigger value="architecture" className="flex items-center gap-2">
            <Workflow className="h-4 w-4" />
            Architecture
          </TabsTrigger>
        </TabsList>

        <TabsContent value="api-keys">
          <ApiKeysManager />
        </TabsContent>

        <TabsContent value="mcp">
          <MCPConnector />
        </TabsContent>

        <TabsContent value="docs">
          <div className="space-y-6">
            <div className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-xl font-semibold mb-4">API REST Gen3ia</h2>

              <h3 className="font-medium mb-2">Authentification</h3>
              <div className="bg-muted rounded-lg p-4 mb-6 font-mono text-sm">
                <code>Authorization: Bearer gva_votre_cle_api</code>
              </div>

              <h3 className="font-medium mb-3">Endpoints</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-medium">Méthode</th>
                      <th className="text-left py-2 pr-4 font-medium">Endpoint</th>
                      <th className="text-left py-2 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr><td className="py-2 pr-4"><span className="text-green-500 font-medium">GET</span></td><td className="py-2 pr-4 font-mono">/api/keys</td><td className="py-2">Liste des clés API</td></tr>
                    <tr><td className="py-2 pr-4"><span className="text-blue-500 font-medium">POST</span></td><td className="py-2 pr-4 font-mono">/api/keys</td><td className="py-2">Créer une clé API</td></tr>
                    <tr><td className="py-2 pr-4"><span className="text-red-500 font-medium">DELETE</span></td><td className="py-2 pr-4 font-mono">/api/keys</td><td className="py-2">Révoquer une clé API</td></tr>
                    <tr><td className="py-2 pr-4"><span className="text-green-500 font-medium">GET</span></td><td className="py-2 pr-4 font-mono">/api/connectors</td><td className="py-2">Liste des connecteurs</td></tr>
                    <tr><td className="py-2 pr-4"><span className="text-blue-500 font-medium">POST</span></td><td className="py-2 pr-4 font-mono">/api/connectors/mcp</td><td className="py-2">Créer un serveur MCP</td></tr>
                  </tbody>
                </table>
              </div>

              <h3 className="font-medium mt-6 mb-3">Limites par plan</h3>
              <div className="grid gap-3 sm:grid-cols-4">
                {[
                  { name: 'Free', keys: '0', rate: '-' },
                  { name: 'Starter', keys: '3', rate: '60 req/min' },
                  { name: 'Pro', keys: '10', rate: '300 req/min' },
                  { name: 'Enterprise', keys: '50', rate: '1000 req/min' },
                ].map((plan) => (
                  <div key={plan.name} className="bg-muted rounded-lg p-3 text-center">
                    <p className="font-medium text-sm">{plan.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{plan.keys} clés</p>
                    <p className="text-xs text-muted-foreground">{plan.rate}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-xl font-semibold mb-4">Intégration MCP</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Gen3ia est compatible avec le protocole MCP (Model Context Protocol).
                Connectez vos agents depuis Cursor, Claude Desktop, Windsurf, ou tout client MCP.
              </p>
              <div className="bg-muted rounded-lg p-4 font-mono text-sm">
                <code>{`{
  "mcpServers": {
    "gen3ia": {
      "url": "https://gen3ia.ai/api/mcp",
      "apiKey": "gva_votre_cle"
    }
  }
}`}</code>
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-xl font-semibold mb-4">SDK</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Utilisez le SDK TypeScript pour intégrer Gen3ia directement dans votre code.
              </p>
              <div className="bg-muted rounded-lg p-4 font-mono text-sm mb-4">
                <code>{`npm install gen3ia-sdk`}</code>
              </div>
              <div className="bg-muted rounded-lg p-4 font-mono text-sm">
                <code>{`import { Gen3iaClient } from "gen3ia-sdk";

const client = new Gen3iaClient({
  apiKey: process.env.GEN3IA_API_KEY,
});

const result = await client.executeAgent(
  "agent_id",
  "Crée un rapport..."
);`}</code>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="architecture">
          <Suspense fallback={<ArchitectureFallback />}>
            <AgentFlow />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
