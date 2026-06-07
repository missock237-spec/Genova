import { getWhatsAppRouter } from './src/lib/whatsapp-router';

async function testWhatsApp() {
  console.log('--- Testing Genova WhatsApp Integration ---');

  const router = getWhatsAppRouter();
  const status = router.getConnectionStatus();

  console.log('WhatsApp Router Status:');
  console.log('  Active Provider:', status.activeProvider);
  console.log('  Baileys State:', status.baileysState);
  console.log('  Official API Available:', status.officialApiAvailable);

  if (status.baileysQrRequired) {
    console.log('  NOTICE: Baileys requires QR code scan to connect.');
  }

  console.log('\nWhatsApp integration is configured and waiting for credentials/connection.');
}

testWhatsApp();
