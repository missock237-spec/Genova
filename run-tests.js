const { spawn } = require('child_process');
const http = require('http');
const { Client } = require('pg');

function apiCall(method, path, body, cookie, port = 3000) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const options = {
      hostname: '127.0.0.1', port, path, method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { 'Cookie': cookie } : {}) },
      timeout: 60000,
    };
    const req = http.request(options, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => { resolve({ status: res.statusCode, body: d, cookies: res.headers['set-cookie'] || [] }); });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTests() {
  // Start Next.js
  console.log('Starting Next.js dev server...');
  const nextProc = spawn('npx', ['next', 'dev', '-p', '3000', '-H', '0.0.0.0'], {
    cwd: '/home/z/my-project',
    env: { ...process.env, DATABASE_URL: 'postgresql://genova:genova_secret@127.0.0.1:5432/genova' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  
  nextProc.stderr.on('data', (data) => {
    const msg = data.toString();
    if (msg.includes('Ready')) {
      console.log('Next.js ready!');
    }
  });
  
  // Wait for server
  await new Promise(r => setTimeout(r, 8000));
  
  // Verify port
  try {
    await apiCall('GET', '/api/auth/login', null, '');
  } catch (e) {
    console.log('Server not responding, waiting more...');
    await new Promise(r => setTimeout(r, 5000));
  }
  
  const results = [];
  
  try {
    // LOGIN
    const login = await apiCall('POST', '/api/auth/login', { email: 'admin@genova.ai', password: 'Genova2024!' });
    const sessionCookie = login.cookies.find(c => c.startsWith('genova_session='));
    const token = sessionCookie ? sessionCookie.split(';')[0] : '';
    results.push({ test: 'LOGIN', status: login.status, ok: login.status === 200 });
    console.log('✅ LOGIN:', login.status);
    
    // AUTH/ME
    const me = await apiCall('GET', '/api/auth/me', null, token);
    results.push({ test: 'AUTH/ME', status: me.status, ok: me.status === 200 });
    console.log((me.status === 200 ? '✅' : '❌') + ' AUTH/ME:', me.status);
    
    // CORE APIs
    const apis = [
      ['DASHBOARD/STATS', '/api/dashboard/stats'],
      ['AGENTS', '/api/agents'],
      ['INTEGRATIONS', '/api/integrations'],
      ['CONNECTORS', '/api/connectors'],
      ['WHATSAPP/CONFIG', '/api/whatsapp/config'],
      ['KNOWLEDGE', '/api/knowledge'],
      ['GUARDRAILS', '/api/guardrails'],
      ['CONVERSATIONS', '/api/conversations'],
      ['WORKFLOWS', '/api/workflows'],
      ['MEMORY/STATS', '/api/memory/stats'],
      ['ACTIVITIES', '/api/activities'],
      ['QUEUE/STATUS', '/api/queue/status'],
      ['ANALYTICS/MONITORING', '/api/analytics/monitoring'],
      ['ANALYTICS/COSTS', '/api/analytics/costs'],
      ['ANALYTICS/USAGE', '/api/analytics/usage'],
      ['OBSERVABILITY/TRACES', '/api/observability/traces'],
      ['AI-SERVER/HEALTH', '/api/ai-server/health'],
      ['AI-SERVER/STATUS', '/api/ai-server/status'],
      ['ADMIN/AUDIT-LOGS', '/api/admin/audit-logs'],
      ['RAG/DOCUMENTS', '/api/rag/documents'],
      ['SOCIAL/ACCOUNTS', '/api/social/accounts'],
    ];
    
    for (const [name, path] of apis) {
      try {
        const res = await apiCall('GET', path, null, token);
        const ok = res.status < 500;
        results.push({ test: name, status: res.status, ok });
        console.log((ok ? '✅' : '❌') + ' ' + name + ':', res.status);
      } catch (e) {
        results.push({ test: name, status: 0, ok: false });
        console.log('❌ ' + name + ': ERROR');
      }
    }
    
    // AI CHAT
    const start = Date.now();
    const chat = await apiCall('POST', '/api/ai/chat', { message: 'Dis bonjour en une phrase.' }, token);
    const elapsed = Date.now() - start;
    results.push({ test: 'AI/CHAT', status: chat.status, ok: chat.status === 200, time: elapsed });
    console.log((chat.status === 200 ? '✅' : '❌') + ' AI/CHAT:', chat.status, elapsed + 'ms');
    if (chat.status === 200) {
      try {
        const data = JSON.parse(chat.body);
        console.log('   Provider:', data.provider, '| Model:', data.model);
        console.log('   Reply:', (data.reply || '').slice(0, 80));
      } catch {}
    }
    
    // BAILEYS
    try {
      const baileys = await apiCall('GET', '/health', null, '', 8186);
      results.push({ test: 'BAILEYS/HEALTH', status: baileys.status, ok: baileys.status === 200 });
      console.log((baileys.status === 200 ? '✅' : '❌') + ' BAILEYS:', baileys.status);
    } catch (e) {
      results.push({ test: 'BAILEYS/HEALTH', status: 0, ok: false });
      console.log('❌ BAILEYS: HORS LIGNE');
    }
    
    // RUFLO
    try {
      const ruflo = await apiCall('GET', '/health', null, '', 8190);
      results.push({ test: 'RUFLO/HEALTH', status: ruflo.status, ok: ruflo.status === 200 });
      console.log((ruflo.status === 200 ? '✅' : '❌') + ' RUFLO:', ruflo.status);
    } catch (e) {
      results.push({ test: 'RUFLO/HEALTH', status: 0, ok: false });
      console.log('❌ RUFLO: HORS LIGNE');
    }
    
    // POSTGRESQL
    const pg = new Client({ host: '127.0.0.1', port: 5432, user: 'genova', password: 'genova_secret', database: 'genova' });
    try {
      await pg.connect();
      const t = await pg.query("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'");
      const u = await pg.query('SELECT count(*) FROM users');
      console.log('✅ PostgreSQL:', t.rows[0].count, 'tables,', u.rows[0].count, 'users');
      results.push({ test: 'POSTGRESQL', status: 200, ok: true });
    } catch (e) {
      console.log('❌ PostgreSQL:', e.message);
      results.push({ test: 'POSTGRESQL', status: 0, ok: false });
    }
    await pg.end();
    
  } catch (e) {
    console.error('Test error:', e.message);
  }
  
  // Summary
  const passed = results.filter(r => r.ok).length;
  console.log('\n' + '='.repeat(50));
  console.log('RÉSUMÉ: ' + passed + '/' + results.length + ' tests passés');
  console.log('='.repeat(50));
  
  // Kill Next.js
  nextProc.kill();
  process.exit(0);
}

runTests();
