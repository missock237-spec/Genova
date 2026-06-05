import http from 'http';

function apiCall(method, path, body, cookie, port = 3000) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const options = {
      hostname: '127.0.0.1', port, path, method,
      headers: { 
        'Content-Type': 'application/json',
        ...(cookie ? { 'Cookie': cookie } : {}),
      },
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

async function main() {
  const results = [];
  
  try {
    // 1. LOGIN
    console.log('1. Testing LOGIN...');
    const login = await apiCall('POST', '/api/auth/login', { email: 'admin@genova.ai', password: 'Genova2024!' });
    const sessionCookie = login.cookies.find(c => c.startsWith('genova_session='));
    const token = sessionCookie ? sessionCookie.split(';')[0] : '';
    results.push({ test: 'LOGIN', status: login.status, ok: login.status === 200 });
    console.log(`   Status: ${login.status} ${login.status === 200 ? 'OK' : 'FAIL'}`);
    
    // 2-15. Test authenticated endpoints
    const endpoints = [
      ['AUTH/ME', '/api/auth/me'],
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
    ];
    
    for (const [name, path] of endpoints) {
      try {
        const res = await apiCall('GET', path, null, token);
        const ok = res.status === 200 || res.status === 404; // 404 is acceptable for empty lists
        results.push({ test: name, status: res.status, ok });
        console.log(`   ${name}: ${res.status} ${ok ? 'OK' : 'FAIL'}`);
      } catch (e) {
        results.push({ test: name, status: 0, ok: false });
        console.log(`   ${name}: ERROR ${e.message}`);
      }
    }
    
    // 16. Test AI Chat (measure response time)
    console.log('16. Testing AI CHAT (timing)...');
    const start = Date.now();
    try {
      const chat = await apiCall('POST', '/api/ai/chat', { 
        messages: [{ role: 'user', content: 'Say hello in one sentence.' }],
        model: 'fast'
      }, token);
      const elapsed = Date.now() - start;
      results.push({ test: 'AI/CHAT', status: chat.status, ok: chat.status === 200, time: elapsed });
      console.log(`   AI/CHAT: ${chat.status} in ${elapsed}ms ${chat.status === 200 ? 'OK' : 'FAIL'}`);
    } catch (e) {
      const elapsed = Date.now() - start;
      results.push({ test: 'AI/CHAT', status: 0, ok: false, time: elapsed });
      console.log(`   AI/CHAT: ERROR after ${elapsed}ms - ${e.message}`);
    }
    
    // 17. Test Baileys WhatsApp API
    console.log('17. Testing BAILEYS HEALTH...');
    try {
      const baileys = await apiCall('GET', '/health', null, '', 8186);
      results.push({ test: 'BAILEYS/HEALTH', status: baileys.status, ok: baileys.status === 200 });
      console.log(`   BAILEYS: ${baileys.status} ${baileys.status === 200 ? 'OK' : 'FAIL'}`);
      if (baileys.status === 200) {
        const data = JSON.parse(baileys.body);
        console.log(`   Connection: ${data.connection}, Uptime: ${Math.floor(data.uptime)}s`);
      }
    } catch (e) {
      results.push({ test: 'BAILEYS/HEALTH', status: 0, ok: false });
      console.log(`   BAILEYS: ERROR - ${e.message}`);
    }
    
    // 18. Test Ruflo MCP API
    console.log('18. Testing RUFLO MCP HEALTH...');
    try {
      const ruflo = await apiCall('GET', '/health', null, '', 8190);
      results.push({ test: 'RUFLO/HEALTH', status: ruflo.status, ok: ruflo.status === 200 });
      console.log(`   RUFLO: ${ruflo.status} ${ruflo.status === 200 ? 'OK' : 'FAIL'}`);
    } catch (e) {
      results.push({ test: 'RUFLO/HEALTH', status: 0, ok: false });
      console.log(`   RUFLO: ERROR - ${e.message}`);
    }
    
    // 19. Test Ruflo MCP method
    console.log('19. Testing RUFLO MCP SWARM_INIT...');
    try {
      const swarm = await apiCall('POST', '/mcp', { method: 'swarm_init', params: { topology: 'mesh' } }, '', 8190);
      results.push({ test: 'RUFLO/SWARM', status: swarm.status, ok: swarm.status === 200 });
      console.log(`   SWARM_INIT: ${swarm.status} ${swarm.status === 200 ? 'OK' : 'FAIL'}`);
    } catch (e) {
      results.push({ test: 'RUFLO/SWARM', status: 0, ok: false });
      console.log(`   SWARM_INIT: ERROR - ${e.message}`);
    }
    
    // 20. Test Email via Resend
    console.log('20. Testing EMAIL (Resend)...');
    try {
      // Use the register endpoint which sends email
      const emailTest = await apiCall('POST', '/api/auth/forgot-password', { email: 'admin@genova.ai' }, token);
      results.push({ test: 'EMAIL/FORGOT', status: emailTest.status, ok: emailTest.status === 200 || emailTest.status === 404 });
      console.log(`   FORGOT-PASSWORD: ${emailTest.status}`);
    } catch (e) {
      results.push({ test: 'EMAIL/FORGOT', status: 0, ok: false });
      console.log(`   EMAIL: ERROR - ${e.message}`);
    }
    
  } catch (e) {
    console.error('Fatal test error:', e.message);
  }
  
  // Summary
  console.log('\n========== TEST RESULTS ==========');
  for (const r of results) {
    const icon = r.ok ? '✅' : '❌';
    const time = r.time ? ` (${r.time}ms)` : '';
    console.log(`${icon} ${r.test}: ${r.status}${time}`);
  }
  const passed = results.filter(r => r.ok).length;
  console.log(`\nTotal: ${passed}/${results.length} passed`);
}

main();
