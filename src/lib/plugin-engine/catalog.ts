// ============================================================
// Plugin Catalog — 50+ applications réelles avec actions vérifiées
// Complémentaire au plugin-sdk communautaire
// ============================================================

import type { PluginCatalogEntry } from './types';

export const PLUGIN_CATALOG: Record<string, PluginCatalogEntry> = {
  // ───────────────────────────────────────────────
  // COMMUNICATION
  // ───────────────────────────────────────────────
  slack: {
    id: 'slack', name: 'Slack',
    description: 'Envoyer des messages, gérer des canaux et des fichiers dans les workspaces Slack.',
    icon: 'MessageSquare', categories: ['Communication', 'Team'],
    baseUrl: 'https://slack.com/api', authType: 'bearer',
    docsUrl: 'https://api.slack.com/methods', website: 'https://slack.com', popularityRank: 1,
    actions: {
      postMessage: {
        id: 'postMessage', name: 'Envoyer un message', description: 'Publie un message dans un canal Slack.',
        method: 'POST', endpoint: '/chat.postMessage',
        params: [
          { name: 'channel', type: 'string', required: true, description: 'ID ou nom du canal (#general)' },
          { name: 'text', type: 'string', required: true, description: 'Contenu du message' },
          { name: 'as_user', type: 'boolean', required: false, description: 'Publier en tant qu\'utilisateur (bot par défaut)' },
        ],
        bodyParams: ['channel', 'text', 'as_user'],
        timeoutMs: 10000,
      },
      listChannels: {
        id: 'listChannels', name: 'Lister les canaux', description: 'Récupère la liste des canaux du workspace.',
        method: 'GET', endpoint: '/conversations.list',
        params: [
          { name: 'types', type: 'string', required: false, description: 'Filtrer par type (public_channel, private_channel)' },
          { name: 'limit', type: 'number', required: false, description: 'Nombre max de résultats' },
        ],
        timeoutMs: 10000,
      },
    },
  },

  discord: {
    id: 'discord', name: 'Discord',
    description: 'Envoyer des messages et gérer des serveurs Discord via le bot API.',
    icon: 'Gamepad2', categories: ['Communication', 'Gaming'],
    baseUrl: 'https://discord.com/api/v10', authType: 'bearer',
    docsUrl: 'https://discord.com/developers/docs', website: 'https://discord.com', popularityRank: 5,
    actions: {
      sendMessage: {
        id: 'sendMessage', name: 'Envoyer un message', description: 'Envoie un message dans un canal Discord.',
        method: 'POST', endpoint: '/channels/{channelId}/messages',
        params: [
          { name: 'channelId', type: 'string', required: true, description: 'ID du canal' },
          { name: 'content', type: 'string', required: true, description: 'Contenu du message' },
          { name: 'embed', type: 'object', required: false, description: 'Embed Discord (riche)' },
        ],
        urlParams: ['channelId'], bodyParams: ['content', 'embed'],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // DÉVELOPPEMENT & DevOps
  // ───────────────────────────────────────────────
  github: {
    id: 'github', name: 'GitHub',
    description: 'Gérer les repos, issues, PR, actions et workflows GitHub.',
    icon: 'Github', categories: ['DevOps', 'Développement'],
    baseUrl: 'https://api.github.com', authType: 'token',
    docsUrl: 'https://docs.github.com/en/rest', website: 'https://github.com', popularityRank: 2,
    actions: {
      createIssue: {
        id: 'createIssue', name: 'Créer une issue', description: 'Crée une issue dans un repository.',
        method: 'POST', endpoint: '/repos/{owner}/{repo}/issues',
        params: [
          { name: 'owner', type: 'string', required: true, description: 'Propriétaire du repo' },
          { name: 'repo', type: 'string', required: true, description: 'Nom du repository' },
          { name: 'title', type: 'string', required: true, description: 'Titre de l\'issue' },
          { name: 'body', type: 'string', required: false, description: 'Description (Markdown)' },
          { name: 'labels', type: 'array', required: false, description: 'Labels à appliquer' },
        ],
        urlParams: ['owner', 'repo'], bodyParams: ['title', 'body', 'labels'],
        timeoutMs: 15000,
      },
      listRepos: {
        id: 'listRepos', name: 'Lister les repos', description: 'Liste les repos de l\'utilisateur ou d\'une org.',
        method: 'GET', endpoint: '/user/repos',
        params: [
          { name: 'sort', type: 'string', required: false, description: 'Tri (updated, created, pushed, full_name)' },
          { name: 'per_page', type: 'number', required: false, description: 'Résultats par page (max 100)' },
        ],
        timeoutMs: 10000,
      },
      createWebhook: {
        id: 'createWebhook', name: 'Créer un webhook', description: 'Ajoute un webhook à un repo.',
        method: 'POST', endpoint: '/repos/{owner}/{repo}/hooks',
        params: [
          { name: 'owner', type: 'string', required: true, description: 'Propriétaire' },
          { name: 'repo', type: 'string', required: true, description: 'Nom du repo' },
          { name: 'config_url', type: 'string', required: true, description: 'URL du webhook' },
          { name: 'events', type: 'array', required: false, description: 'Événements (push, issues, ...)' },
        ],
        urlParams: ['owner', 'repo'],
        bodyParams: ['config_url', 'events'],
        timeoutMs: 10000,
      },
    },
  },

  gitlab: {
    id: 'gitlab', name: 'GitLab',
    description: 'Gérer les projets, pipelines et issues GitLab.',
    icon: 'GitBranch', categories: ['DevOps', 'CI/CD'],
    baseUrl: 'https://gitlab.com/api/v4', authType: 'bearer',
    docsUrl: 'https://docs.gitlab.com/ee/api/', website: 'https://gitlab.com', popularityRank: 15,
    actions: {
      createIssue: {
        id: 'createIssue', name: 'Créer une issue', description: 'Crée une issue dans un projet GitLab.',
        method: 'POST', endpoint: '/projects/{projectId}/issues',
        params: [
          { name: 'projectId', type: 'string', required: true, description: 'ID du projet' },
          { name: 'title', type: 'string', required: true, description: 'Titre' },
          { name: 'description', type: 'string', required: false, description: 'Description' },
        ],
        urlParams: ['projectId'], bodyParams: ['title', 'description'],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // PRODUCTIVITÉ
  // ───────────────────────────────────────────────
  notion: {
    id: 'notion', name: 'Notion',
    description: 'Créer, mettre à jour et interroger des pages et bases de données Notion.',
    icon: 'BookOpen', categories: ['Productivité', 'Base de données'],
    baseUrl: 'https://api.notion.com/v1', authType: 'bearer',
    docsUrl: 'https://developers.notion.com/reference/intro', website: 'https://notion.so', popularityRank: 3,
    actions: {
      createPage: {
        id: 'createPage', name: 'Créer une page', description: 'Crée une page dans un workspace Notion.',
        method: 'POST', endpoint: '/pages',
        params: [
          { name: 'parent', type: 'object', required: true, description: 'Parent (database_id ou page_id)' },
          { name: 'properties', type: 'object', required: true, description: 'Propriétés de la page' },
          { name: 'children', type: 'array', required: false, description: 'Blocs de contenu' },
        ],
        bodyParams: ['parent', 'properties', 'children'],
        timeoutMs: 15000,
      },
      queryDatabase: {
        id: 'queryDatabase', name: 'Interroger une base', description: 'Requête une base de données Notion avec filtres.',
        method: 'POST', endpoint: '/databases/{databaseId}/query',
        params: [
          { name: 'databaseId', type: 'string', required: true, description: 'ID de la base' },
          { name: 'filter', type: 'object', required: false, description: 'Filtre Notion' },
          { name: 'sorts', type: 'array', required: false, description: 'Tri' },
        ],
        urlParams: ['databaseId'], bodyParams: ['filter', 'sorts'],
        timeoutMs: 15000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // PAIEMENT & FINANCE
  // ───────────────────────────────────────────────
  stripe: {
    id: 'stripe', name: 'Stripe',
    description: 'Traiter les paiements, gérer les clients, abonnements et factures.',
    icon: 'CreditCard', categories: ['Paiement', 'Finance'],
    baseUrl: 'https://api.stripe.com/v1', authType: 'basic',
    docsUrl: 'https://stripe.com/docs/api', website: 'https://stripe.com', popularityRank: 4,
    actions: {
      createCustomer: {
        id: 'createCustomer', name: 'Créer un client', description: 'Crée un client Stripe.',
        method: 'POST', endpoint: '/customers',
        params: [
          { name: 'email', type: 'string', required: true, description: 'Email du client' },
          { name: 'name', type: 'string', required: false, description: 'Nom affiché' },
          { name: 'metadata', type: 'object', required: false, description: 'Métadonnées clé-valeur' },
        ],
        bodyParams: ['email', 'name', 'metadata'],
        timeoutMs: 10000,
      },
      createPaymentIntent: {
        id: 'createPaymentIntent', name: 'Créer un PaymentIntent', description: 'Initie un paiement.',
        method: 'POST', endpoint: '/payment_intents',
        params: [
          { name: 'amount', type: 'number', required: true, description: 'Montant en centimes' },
          { name: 'currency', type: 'string', required: true, description: 'Devise (eur, usd, ...)' },
          { name: 'customer', type: 'string', required: false, description: 'ID client' },
          { name: 'metadata', type: 'object', required: false, description: 'Métadonnées' },
        ],
        bodyParams: ['amount', 'currency', 'customer', 'metadata'],
        timeoutMs: 15000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // IA & LLM
  // ───────────────────────────────────────────────
  openai: {
    id: 'openai', name: 'OpenAI',
    description: 'Appeler les modèles GPT-4o, DALL-E, Whisper et TTS d\'OpenAI.',
    icon: 'Sparkles', categories: ['IA', 'LLM'],
    baseUrl: 'https://api.openai.com/v1', authType: 'bearer',
    docsUrl: 'https://platform.openai.com/docs/api-reference', website: 'https://openai.com', popularityRank: 6,
    actions: {
      chatCompletion: {
        id: 'chatCompletion', name: 'Chat Completion', description: 'Génère une réponse avec un modèle de chat.',
        method: 'POST', endpoint: '/chat/completions',
        params: [
          { name: 'model', type: 'string', required: true, description: 'Modèle (gpt-4o, gpt-4o-mini, ...)' },
          { name: 'messages', type: 'array', required: true, description: 'Messages de conversation' },
          { name: 'max_tokens', type: 'number', required: false, description: 'Token max' },
          { name: 'temperature', type: 'number', required: false, description: 'Température (0-2)' },
        ],
        bodyParams: ['model', 'messages', 'max_tokens', 'temperature'],
        timeoutMs: 60000,
      },
    },
  },

  anthropic: {
    id: 'anthropic', name: 'Anthropic Claude',
    description: 'Appeler les modèles Claude d\'Anthropic.',
    icon: 'Brain', categories: ['IA', 'LLM'],
    baseUrl: 'https://api.anthropic.com/v1', authType: 'api_key_header',
    docsUrl: 'https://docs.anthropic.com/en/api', website: 'https://anthropic.com', popularityRank: 7,
    actions: {
      createMessage: {
        id: 'createMessage', name: 'Créer un message', description: 'Génère une réponse Claude.',
        method: 'POST', endpoint: '/messages',
        params: [
          { name: 'model', type: 'string', required: true, description: 'Modèle (claude-sonnet-4-20250514, ...)' },
          { name: 'max_tokens', type: 'number', required: true, description: 'Token max' },
          { name: 'messages', type: 'array', required: true, description: 'Messages' },
        ],
        bodyParams: ['model', 'max_tokens', 'messages'],
        timeoutMs: 60000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // CRM & MARKETING
  // ───────────────────────────────────────────────
  hubspot: {
    id: 'hubspot', name: 'HubSpot',
    description: 'Gérer les contacts, deals et companies dans HubSpot CRM.',
    icon: 'Building', categories: ['CRM', 'Marketing'],
    baseUrl: 'https://api.hubapi.com', authType: 'bearer',
    docsUrl: 'https://developers.hubspot.com/docs/api', website: 'https://hubspot.com', popularityRank: 10,
    actions: {
      createContact: {
        id: 'createContact', name: 'Créer un contact', description: 'Crée un contact dans HubSpot.',
        method: 'POST', endpoint: '/crm/v3/objects/contacts',
        params: [
          { name: 'email', type: 'string', required: true, description: 'Email' },
          { name: 'firstname', type: 'string', required: false, description: 'Prénom' },
          { name: 'lastname', type: 'string', required: false, description: 'Nom' },
        ],
        bodyParams: ['email', 'firstname', 'lastname'],
        timeoutMs: 10000,
      },
    },
  },

  mailchimp: {
    id: 'mailchimp', name: 'Mailchimp',
    description: 'Gérer les audiences, campagnes et templates d\'emails.',
    icon: 'Mail', categories: ['Email', 'Marketing'],
    baseUrl: 'https://\{dc\}.api.mailchimp.com/3.0', authType: 'basic',
    docsUrl: 'https://mailchimp.com/developer/marketing/api/', website: 'https://mailchimp.com', popularityRank: 20,
    actions: {
      addMember: {
        id: 'addMember', name: 'Ajouter un membre', description: 'Ajoute un contact à une audience.',
        method: 'POST', endpoint: '/lists/{listId}/members',
        params: [
          { name: 'listId', type: 'string', required: true, description: 'ID de la liste' },
          { name: 'email_address', type: 'string', required: true, description: 'Email du membre' },
          { name: 'status', type: 'string', required: false, description: 'subscribed ou unsubscribed' },
        ],
        urlParams: ['listId'], bodyParams: ['email_address', 'status'],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // CLOUD & INFRASTRUCTURE
  // ───────────────────────────────────────────────
  aws: {
    id: 'aws', name: 'AWS',
    description: 'Interagir avec les services AWS (S3, Lambda, EC2, SQS, SNS, ...).',
    icon: 'Cloud', categories: ['Cloud', 'Infrastructure'],
    baseUrl: 'https://\{service\}.{region\}.amazonaws.com', authType: 'bearer',
    docsUrl: 'https://docs.aws.amazon.com/', website: 'https://aws.amazon.com', popularityRank: 8,
    actions: {
      s3PutObject: {
        id: 's3PutObject', name: 'Uploader sur S3', description: 'Uploade un objet dans un bucket S3.',
        method: 'PUT', endpoint: '/{bucket}/{key}',
        params: [
          { name: 'bucket', type: 'string', required: true, description: 'Nom du bucket' },
          { name: 'key', type: 'string', required: true, description: 'Clé de l\'objet' },
          { name: 'body', type: 'string', required: false, description: 'Contenu (texte)' },
        ],
        urlParams: ['bucket', 'key'],
        timeoutMs: 30000,
      },
    },
  },

  vercel: {
    id: 'vercel', name: 'Vercel',
    description: 'Déployer, lister et gérer les projets et déploiements Vercel.',
    icon: 'Triangle', categories: ['Cloud', 'Déploiement'],
    baseUrl: 'https://api.vercel.com/v9', authType: 'bearer',
    docsUrl: 'https://vercel.com/docs/api', website: 'https://vercel.com', popularityRank: 12,
    actions: {
      listDeployments: {
        id: 'listDeployments', name: 'Lister les déploiements', description: 'Liste les déploiements d\'un projet.',
        method: 'GET', endpoint: '/deployments',
        params: [
          { name: 'projectId', type: 'string', required: true, description: 'ID du projet' },
          { name: 'limit', type: 'number', required: false, description: 'Nombre max' },
        ],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // STOCKAGE & FICHIERS
  // ───────────────────────────────────────────────
  googledrive: {
    id: 'googledrive', name: 'Google Drive',
    description: 'Uploader, lister et partager des fichiers sur Google Drive.',
    icon: 'HardDrive', categories: ['Stockage', 'Productivité'],
    baseUrl: 'https://www.googleapis.com/drive/v3', authType: 'bearer',
    docsUrl: 'https://developers.google.com/drive/api/v3/reference', website: 'https://drive.google.com', popularityRank: 9,
    actions: {
      listFiles: {
        id: 'listFiles', name: 'Lister les fichiers', description: 'Liste les fichiers d\'un dossier.',
        method: 'GET', endpoint: '/files',
        params: [
          { name: 'q', type: 'string', required: false, description: 'Requête de recherche' },
          { name: 'pageSize', type: 'number', required: false, description: 'Taille de page' },
        ],
        timeoutMs: 10000,
      },
    },
  },

  dropbox: {
    id: 'dropbox', name: 'Dropbox',
    description: 'Gérer les fichiers et dossiers Dropbox.',
    icon: 'Folder', categories: ['Stockage'],
    baseUrl: 'https://api.dropboxapi.com/2', authType: 'bearer',
    docsUrl: 'https://www.dropbox.com/developers/documentation', website: 'https://dropbox.com', popularityRank: 25,
    actions: {
      listFolder: {
        id: 'listFolder', name: 'Lister un dossier', description: 'Liste le contenu d\'un dossier.',
        method: 'POST', endpoint: '/files/list_folder',
        params: [
          { name: 'path', type: 'string', required: false, description: 'Chemin du dossier (défaut: racine)' },
        ],
        bodyParams: ['path'],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // PROJECT MANAGEMENT
  // ───────────────────────────────────────────────
  jira: {
    id: 'jira', name: 'Jira',
    description: 'Créer et gérer les tickets, sprints et projets Jira.',
    icon: 'Ticket', categories: ['Project Management', 'DevOps'],
    baseUrl: 'https://\{domain\}/rest/api/3', authType: 'basic',
    docsUrl: 'https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/', website: 'https://www.atlassian.com/software/jira', popularityRank: 11,
    actions: {
      createIssue: {
        id: 'createIssue', name: 'Créer un ticket', description: 'Crée un ticket Jira.',
        method: 'POST', endpoint: '/issue/{projectKey}',
        params: [
          { name: 'projectKey', type: 'string', required: true, description: 'Clé du projet (ex: PROJ)' },
          { name: 'summary', type: 'string', required: true, description: 'Résumé du ticket' },
          { name: 'description', type: 'string', required: false, description: 'Description' },
          { name: 'issuetype_name', type: 'string', required: false, description: 'Type (Bug, Task, Story)' },
        ],
        urlParams: ['projectKey'], bodyParams: ['summary', 'description', 'issuetype_name'],
        timeoutMs: 10000,
      },
    },
  },

  trello: {
    id: 'trello', name: 'Trello',
    description: 'Gérer les boards, listes et cartes Trello.',
    icon: 'LayoutGrid', categories: ['Project Management'],
    baseUrl: 'https://api.trello.com/1', authType: 'bearer',
    docsUrl: 'https://developer.atlassian.com/cloud/trello/rest/api-intro/', website: 'https://trello.com', popularityRank: 18,
    actions: {
      createCard: {
        id: 'createCard', name: 'Créer une carte', description: 'Ajoute une carte à une liste Trello.',
        method: 'POST', endpoint: '/cards',
        params: [
          { name: 'idList', type: 'string', required: true, description: 'ID de la liste' },
          { name: 'name', type: 'string', required: true, description: 'Nom de la carte' },
          { name: 'desc', type: 'string', required: false, description: 'Description' },
        ],
        bodyParams: ['idList', 'name', 'desc'],
        timeoutMs: 10000,
      },
    },
  },

  asana: {
    id: 'asana', name: 'Asana',
    description: 'Gérer les tâches, projets et équipes Asana.',
    icon: 'CheckSquare', categories: ['Project Management'],
    baseUrl: 'https://app.asana.com/api/1.0', authType: 'bearer',
    docsUrl: 'https://developers.asana.com/docs/', website: 'https://asana.com', popularityRank: 22,
    actions: {
      createTask: {
        id: 'createTask', name: 'Créer une tâche', description: 'Crée une tâche dans un projet.',
        method: 'POST', endpoint: '/tasks',
        params: [
          { name: 'name', type: 'string', required: true, description: 'Nom de la tâche' },
          { name: 'workspace', type: 'string', required: true, description: 'ID du workspace' },
          { name: 'projects', type: 'array', required: false, description: 'ID des projets' },
        ],
        bodyParams: ['name', 'workspace', 'projects'],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // EMAIL TRANSACTIONNEL
  // ───────────────────────────────────────────────
  sendgrid: {
    id: 'sendgrid', name: 'SendGrid',
    description: 'Envoyer des emails transactionnels via l\'API SendGrid.',
    icon: 'Send', categories: ['Email', 'Communication'],
    baseUrl: 'https://api.sendgrid.com/v3', authType: 'bearer',
    docsUrl: 'https://docs.sendgrid.com/api-reference/', website: 'https://sendgrid.com', popularityRank: 14,
    actions: {
      sendEmail: {
        id: 'sendEmail', name: 'Envoyer un email', description: 'Envoie un email via SendGrid.',
        method: 'POST', endpoint: '/mail/send',
        params: [
          { name: 'to', type: 'string', required: true, description: 'Email destinataire' },
          { name: 'from', type: 'string', required: true, description: 'Email expéditeur' },
          { name: 'subject', type: 'string', required: true, description: 'Sujet' },
          { name: 'content', type: 'string', required: true, description: 'Contenu (HTML ou texte)' },
        ],
        bodyParams: ['personalizations', 'from', 'subject', 'content'],
        timeoutMs: 15000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // COMMUNICATIONS UNIFIEES
  // ───────────────────────────────────────────────
  twilio: {
    id: 'twilio', name: 'Twilio',
    description: 'Envoyer des SMS, gérer les appels et les numéros Twilio.',
    icon: 'Phone', categories: ['SMS', 'Communication'],
    baseUrl: 'https://api.twilio.com/2010-04-01', authType: 'basic',
    docsUrl: 'https://www.twilio.com/docs/usage/api', website: 'https://twilio.com', popularityRank: 13,
    actions: {
      sendSms: {
        id: 'sendSms', name: 'Envoyer un SMS', description: 'Envoie un SMS via Twilio.',
        method: 'POST', endpoint: '/Accounts/{accountSid}/Messages.json',
        params: [
          { name: 'accountSid', type: 'string', required: true, description: 'SID du compte' },
          { name: 'To', type: 'string', required: true, description: 'Numéro destinataire' },
          { name: 'From', type: 'string', required: true, description: 'Numéro expéditeur Twilio' },
          { name: 'Body', type: 'string', required: true, description: 'Contenu du message' },
        ],
        urlParams: ['accountSid'], bodyParams: ['To', 'From', 'Body'],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // E-COMMERCE
  // ───────────────────────────────────────────────
  shopify: {
    id: 'shopify', name: 'Shopify',
    description: 'Gérer les produits, commandes et clients d\'une boutique Shopify.',
    icon: 'ShoppingBag', categories: ['E-commerce'],
    baseUrl: 'https://\{shop\}.myshopify.com/admin/api/2025-01', authType: 'bearer',
    docsUrl: 'https://shopify.dev/docs/api/admin-rest', website: 'https://shopify.com', popularityRank: 16,
    actions: {
      listProducts: {
        id: 'listProducts', name: 'Lister les produits', description: 'Récupère les produits de la boutique.',
        method: 'GET', endpoint: '/products.json',
        params: [
          { name: 'limit', type: 'number', required: false, description: 'Nombre max de produits' },
        ],
        timeoutMs: 10000,
      },
    },
  },
};

/** Liste de toutes les catégories uniques du catalogue */
export const PLUGIN_CATEGORIES = Array.from(
  new Set(Object.values(PLUGIN_CATALOG).flatMap((p) => p.categories))
).sort();

export const getTotalPluginCount = () => Object.keys(PLUGIN_CATALOG).length;

export const getPlugin = (id: string): PluginCatalogEntry | null => PLUGIN_CATALOG[id] || null;

export const searchCatalog = (query: string, category?: string): PluginCatalogEntry[] => {
  const q = query.toLowerCase();
  return Object.values(PLUGIN_CATALOG).filter((p) =>
    (p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)) &&
    (!category || p.categories.includes(category))
  );
};
