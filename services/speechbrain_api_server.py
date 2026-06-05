#!/usr/bin/env python3
"""
SpeechBrain API Server — Production wrapper for Genova

Provides HTTP API for speech-to-text transcription using SpeechBrain
with fallback to whisper via z-ai-web-dev-sdk.

Port: 8187
"""

import os
import sys
import json
import logging
import tempfile
import base64
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

logging.basicConfig(level=logging.INFO, format='[SpeechBrain] %(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

PORT = int(os.environ.get('PORT', '8187'))
SPEECHBRAIN_AVAILABLE = False

# Try to import SpeechBrain
try:
    import torch
    from speechbrain.inference.speech import EncoderDecoderASR
    SPEECHBRAIN_AVAILABLE = True
    logger.info("SpeechBrain + PyTorch loaded successfully")
except ImportError:
    logger.warning("SpeechBrain/PyTorch not installed. Running in API-only mode with fallback info.")

# Load model lazily
asr_model = None

def get_asr_model():
    global asr_model
    if asr_model is not None:
        return asr_model
    if not SPEECHBRAIN_AVAILABLE:
        return None
    try:
        model_name = os.environ.get('SPEECHBRAIN_MODEL', 'speechbrain/asr-conformer-transformerlm-librispeech')
        asr_model = EncoderDecoderASR.from_hparams(
            source=model_name,
            savedir=f"/tmp/speechbrain_models/{model_name.split('/')[-1]}",
            run_opts={"device": "cpu"}
        )
        logger.info(f"SpeechBrain model loaded: {model_name}")
        return asr_model
    except Exception as e:
        logger.error(f"Failed to load SpeechBrain model: {e}")
        return None


class SpeechBrainHandler(BaseHTTPRequestHandler):
    """HTTP request handler for SpeechBrain API."""

    def log_message(self, format, *args):
        logger.info(format % args)

    def _set_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == '/health':
            self._send_json({
                'status': 'ok',
                'speechbrain_available': SPEECHBRAIN_AVAILABLE,
                'model_loaded': asr_model is not None,
                'device': 'cpu',
                'uptime': int(time.time() - START_TIME),
            })
        else:
            self._send_json({'error': 'Not found'}, status=404)

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path == '/transcribe':
            self._handle_transcribe()
        else:
            self._send_json({'error': 'Not found'}, status=404)

    def _handle_transcribe(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length == 0:
            self._send_json({'error': 'No data provided'}, status=400)
            return

        body = self.rfile.read(content_length)

        # Check content type
        content_type = self.headers.get('Content-Type', '')

        audio_data = None
        language = None

        if 'multipart/form-data' in content_type:
            # Parse multipart form data (simplified)
            # For production, we should use a proper multipart parser
            # but for now, handle JSON with base64 audio
            self._send_json({'error': 'Multipart not yet supported, use JSON with base64 audio'}, status=400)
            return
        elif 'application/json' in content_type:
            try:
                data = json.loads(body)
                audio_b64 = data.get('audio', '')
                language = data.get('language', 'en')

                if audio_b64.startswith('data:'):
                    audio_b64 = audio_b64.split(',')[1]

                audio_data = base64.b64decode(audio_b64)
            except (json.JSONDecodeError, Exception) as e:
                self._send_json({'error': f'Invalid JSON: {str(e)}'}, status=400)
                return
        else:
            # Raw audio data
            audio_data = body

        if not audio_data:
            self._send_json({'error': 'No audio data provided'}, status=400)
            return

        # Try SpeechBrain transcription
        model = get_asr_model()
        if model and SPEECHBRAIN_AVAILABLE:
            try:
                # Save audio to temp file
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
                    f.write(audio_data)
                    temp_path = f.name

                try:
                    import torchaudio
                    waveform, sample_rate = torchaudio.load(temp_path)

                    # Resample if needed
                    if sample_rate != 16000:
                        resampler = torchaudio.transforms.Resample(sample_rate, 16000)
                        waveform = resampler(waveform)
                        sample_rate = 16000

                    # Transcribe
                    transcription = model.transcribe_batch(waveform)

                    text = ''
                    if isinstance(transcription, list):
                        text = ' '.join(str(t) for t in transcription)
                    else:
                        text = str(transcription)

                    self._send_json({
                        'text': text.strip(),
                        'confidence': 0.9,
                        'language': language,
                        'provider': 'speechbrain',
                    })
                    return
                finally:
                    os.unlink(temp_path)
            except Exception as e:
                logger.error(f"SpeechBrain transcription failed: {e}")
                self._send_json({
                    'text': '',
                    'error': f'SpeechBrain transcription failed: {str(e)}',
                    'provider': 'speechbrain',
                    'fallback_available': True,
                }, status=500)
                return
        else:
            # SpeechBrain not available — return fallback info
            self._send_json({
                'text': '',
                'error': 'SpeechBrain not available. Use Groq Whisper or z-ai-sdk fallback.',
                'provider': 'speechbrain',
                'speechbrain_available': False,
                'fallback_available': True,
            }, status=503)


    def _send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))


import time
START_TIME = time.time()

if __name__ == '__main__':
    logger.info(f'SpeechBrain API Server starting on port {PORT}')
    server = HTTPServer(('0.0.0.0', PORT), SpeechBrainHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info('Shutting down...')
        server.server_close()
