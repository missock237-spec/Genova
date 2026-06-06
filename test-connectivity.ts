import { checkN8NHealth } from './src/lib/n8n-client';
import { checkPocketBaseHealth } from './src/lib/pocketbase-client';
import { checkComfyUIHealth } from './src/lib/comfyui-client';
import { checkFluroHealth } from './src/lib/fluro-client';

async function testConnectivity() {
  console.log('--- Testing Genova AI Tool Connectivity ---');

  const results = {
    n8n: await checkN8NHealth(),
    pocketbase: await checkPocketBaseHealth(),
    comfyui: await checkComfyUIHealth(),
    fluro: await checkFluroHealth().catch(() => false),
  };

  console.log('n8n:', results.n8n ? 'CONNECTED' : 'UNREACHABLE');
  console.log('PocketBase:', results.pocketbase ? 'CONNECTED' : 'UNREACHABLE');
  console.log('ComfyUI:', results.comfyui ? 'CONNECTED' : 'UNREACHABLE');
  console.log('Fluro:', results.fluro ? 'CONNECTED' : 'UNREACHABLE');

  console.log('\nNote: UNREACHABLE is expected in this sandbox environment if services are not running.');
}

testConnectivity();
