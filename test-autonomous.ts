import { AIRouter, createAIRouter } from './src/lib/ai-router';

async function testAutonomousAI() {
  console.log('--- Testing Genova Autonomous AI capabilities ---');

  const router = createAIRouter('test-user');

  try {
    console.log('Attempting autonomous chat...');
    const response = await router.chat([
      { role: 'user', content: 'Say "Genova is autonomous" if you can read this.' }
    ], { model: 'fast' });

    console.log('AI Response:', response.content);
    console.log('Provider used:', response.provider);
    console.log('SUCCESS: AI Router is operational and autonomous.');
  } catch (error) {
    console.error('FAILED: AI Router could not complete request.', error);
  }
}

testAutonomousAI();
