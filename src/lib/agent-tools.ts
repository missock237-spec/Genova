// Agent Tools — Specialized capabilities for each agent type

export interface AgentTool {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'communication' | 'data' | 'automation' | 'analysis' | 'creation';
  applicableAgentTypes: string[];
}

export const AGENT_TOOLS: AgentTool[] = [
  // Communication tools
  { id: 'email', name: 'Email', description: 'Envoyer et recevoir des emails', icon: 'Mail', category: 'communication', applicableAgentTypes: ['sales', 'support', 'marketing', 'rh'] },
  { id: 'whatsapp', name: 'WhatsApp', description: 'Envoyer des messages WhatsApp', icon: 'MessageCircle', category: 'communication', applicableAgentTypes: ['sales', 'support', 'marketing'] },
  { id: 'sms', name: 'SMS', description: 'Envoyer des SMS', icon: 'Smartphone', category: 'communication', applicableAgentTypes: ['sales', 'support'] },
  { id: 'calendar', name: 'Calendrier', description: 'Gérer les rendez-vous et événements', icon: 'Calendar', category: 'communication', applicableAgentTypes: ['sales', 'rh', 'support'] },

  // Data tools
  { id: 'web_search', name: 'Recherche Web', description: 'Chercher des informations sur internet', icon: 'Search', category: 'data', applicableAgentTypes: ['research', 'marketing', 'sales'] },
  { id: 'crm', name: 'CRM', description: 'Accéder au CRM (clients, contacts, deals)', icon: 'Users', category: 'data', applicableAgentTypes: ['sales', 'support', 'marketing'] },
  { id: 'database', name: 'Base de données', description: 'Interroger la base de données interne', icon: 'Database', category: 'data', applicableAgentTypes: ['accounting', 'research', 'custom'] },
  { id: 'api', name: 'APIs externes', description: 'Se connecter à des APIs externes', icon: 'Plug', category: 'data', applicableAgentTypes: ['custom', 'research'] },

  // Automation tools
  { id: 'workflow', name: 'Workflows', description: 'Créer et exécuter des workflows', icon: 'GitBranch', category: 'automation', applicableAgentTypes: ['custom'] },
  { id: 'scheduler', name: 'Planificateur', description: 'Planifier des tâches récurrentes', icon: 'Clock', category: 'automation', applicableAgentTypes: ['marketing', 'sales', 'rh'] },
  { id: 'webhook', name: 'Webhooks', description: 'Écouter et envoyer des webhooks', icon: 'Webhook', category: 'automation', applicableAgentTypes: ['custom'] },

  // Analysis tools
  { id: 'analytics', name: 'Analytics', description: 'Analyser des données et générer des rapports', icon: 'BarChart3', category: 'analysis', applicableAgentTypes: ['marketing', 'accounting', 'research'] },
  { id: 'sentiment', name: 'Analyse sentiment', description: 'Analyser le sentiment des textes', icon: 'Heart', category: 'analysis', applicableAgentTypes: ['support', 'marketing'] },
  { id: 'scoring', name: 'Scoring', description: 'Scorer et classer des prospects/clients', icon: 'Target', category: 'analysis', applicableAgentTypes: ['sales', 'marketing'] },

  // Creation tools
  { id: 'code', name: 'Code', description: 'Écrire et exécuter du code', icon: 'Code', category: 'creation', applicableAgentTypes: ['custom'] },
  { id: 'document', name: 'Documents', description: 'Créer des documents et rapports', icon: 'FileText', category: 'creation', applicableAgentTypes: ['marketing', 'accounting', 'rh'] },
  { id: 'image', name: 'Images', description: 'Générer et modifier des images', icon: 'Image', category: 'creation', applicableAgentTypes: ['marketing'] },
];

export function getToolsForAgentType(type: string): AgentTool[] {
  return AGENT_TOOLS.filter(tool => tool.applicableAgentTypes.includes(type) || tool.applicableAgentTypes.includes('custom'));
}

export function getToolById(id: string): AgentTool | undefined {
  return AGENT_TOOLS.find(tool => tool.id === id);
}
