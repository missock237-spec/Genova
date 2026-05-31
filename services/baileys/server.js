/**
 * Baileys WhatsApp API Server — Production wrapper for Genova
 *
 * Runs Baileys in a separate Node.js process and exposes an HTTP API
 * for the Genova SaaS to send messages, media, and check status.
 *
 * Port: 8186
 */

const http = require('http');
const { URL } = require('url');

const PORT = parseInt(process.env.PORT || '8186', 10);
const AUTH_DIR = process.env.AUTH_DIR || './auth_info';

// ============================================================
// State
// ============================================================

let sock = null;
let connectionState = 'disconnected';
let connectedPhoneNumber = null;
let qrCode = null;

// ============================================================
// Baileys Integration (loaded dynamically)
// ============================================================

async function initializeBaileys() {
  try {
    const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      logger: require('pino')({ level: 'silent' }),
    });

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        qrCode = qr;
        console.log('[Baileys] QR Code generated — scan with WhatsApp');
      }

      if (connection === 'close') {
        connectionState = 'disconnected';
        connectedPhoneNumber = null;
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(`[Baileys] Connection closed. Reconnect: ${shouldReconnect}`);

        if (shouldReconnect) {
          setTimeout(initializeBaileys, 3000);
        }
      } else if (connection === 'open') {
        connectionState = 'connected';
        qrCode = null;
        console.log('[Baileys] WhatsApp connection established');
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // Message tracking
    sock.ev.on('messages.upsert', ({ messages }) => {
      for (const msg of messages) {
        if (!msg.key.fromMe && msg.key.remoteJid) {
          console.log(`[Baileys] Message from ${msg.key.remoteJid}: ${msg.message?.conversation || '[media]'}`);
        }
      }
    });

    connectionState = 'connecting';
    console.log('[Baileys] Initializing WhatsApp connection...');
  } catch (error) {
    console.error('[Baileys] Failed to initialize:', error.message);
    console.log('[Baileys] Running in API-only mode (no WhatsApp connection)');
    connectionState = 'unavailable';
  }
}

// ============================================================
// HTTP Server
// ============================================================

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  try {
    // Health check
    if (url.pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        connection: connectionState,
        phoneNumber: connectedPhoneNumber,
        uptime: process.uptime(),
      }));
      return;
    }

    // Connection status
    if (url.pathname === '/status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        connected: connectionState === 'connected',
        phoneNumber: connectedPhoneNumber,
        state: connectionState,
      }));
      return;
    }

    // Get QR code
    if (url.pathname === '/qr' && req.method === 'GET') {
      if (!qrCode) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No QR code available' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ qr: qrCode }));
      return;
    }

    // Send text message
    if (url.pathname === '/send' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const { to, message, options } = body;

      if (!to || !message) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'to and message are required' }));
        return;
      }

      // Normalize phone number to JID format
      const jid = to.includes('@') ? to : `${to.replace(/[\s\-()]/g, '').replace(/^\+/, '')}@s.whatsapp.net`;

      if (sock && connectionState === 'connected') {
        const sent = await sock.sendMessage(jid, { text: message }, options || {});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          messageId: sent.key.id,
          status: 'sent',
          provider: 'baileys',
        }));
      } else {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'WhatsApp not connected. Scan QR code first.',
          state: connectionState,
        }));
      }
      return;
    }

    // Send media
    if (url.pathname === '/send-media' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const { to, mediaUrl, caption, mediaType } = body;

      if (!to || !mediaUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'to and mediaUrl are required' }));
        return;
      }

      const jid = to.includes('@') ? to : `${to.replace(/[\s\-()]/g, '').replace(/^\+/, '')}@s.whatsapp.net`;

      if (sock && connectionState === 'connected') {
        let messageContent;
        switch (mediaType || 'image') {
          case 'image':
            messageContent = { image: { url: mediaUrl }, caption: caption || '' };
            break;
          case 'video':
            messageContent = { video: { url: mediaUrl }, caption: caption || '' };
            break;
          case 'audio':
            messageContent = { audio: { url: mediaUrl }, mimetype: 'audio/mp4' };
            break;
          case 'document':
            messageContent = { document: { url: mediaUrl }, fileName: caption || 'document', mimetype: 'application/pdf' };
            break;
          default:
            messageContent = { image: { url: mediaUrl }, caption: caption || '' };
        }

        const sent = await sock.sendMessage(jid, messageContent);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          messageId: sent.key.id,
          status: 'sent',
          provider: 'baileys',
        }));
      } else {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'WhatsApp not connected',
          state: connectionState,
        }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    console.error('[Baileys] Request error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message || 'Internal server error' }));
  }
});

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// ============================================================
// Start
// ============================================================

server.listen(PORT, () => {
  console.log(`[Baileys] WhatsApp API Server running on port ${PORT}`);
  console.log(`[Baileys] Health check: http://localhost:${PORT}/health`);
  console.log(`[Baileys] QR code: http://localhost:${PORT}/qr`);
  initializeBaileys();
});

process.on('SIGTERM', () => {
  console.log('[Baileys] SIGTERM received, shutting down...');
  if (sock) {
    sock.end(undefined);
  }
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[Baileys] SIGINT received, shutting down...');
  if (sock) {
    sock.end(undefined);
  }
  server.close(() => process.exit(0));
});
