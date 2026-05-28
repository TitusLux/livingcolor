"""LivingColor backend — powered by Claude Code (user's subscription)."""

import os
import json
import subprocess
import tempfile
import base64
from flask import Flask, request, jsonify, send_from_directory

STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
app = Flask(__name__, static_folder=STATIC_DIR, static_url_path='')

CLAUDE_CMD = os.environ.get('CLAUDE_CMD', 'claude')


def claude(prompt, image_b64=None):
    """Run Claude Code in non-interactive mode. Returns response text."""
    with tempfile.TemporaryDirectory() as tmpdir:
        img_path = None
        if image_b64:
            img_path = os.path.join(tmpdir, 'drawing.png')
            with open(img_path, 'wb') as f:
                f.write(base64.b64decode(image_b64))

        full_prompt = prompt
        if img_path:
            full_prompt = f'Read the image file {img_path} and respond.\n\n{prompt}'

        env = os.environ.copy()
        env.pop('ANTHROPIC_API_KEY', None)
        env.pop('CLAUDE_API_KEY', None)

        result = subprocess.run(
            [CLAUDE_CMD, '-p', '--output-format', 'json',
             '--no-session-persistence', '--dangerously-skip-permissions',
             '--add-dir', tmpdir],
            input=full_prompt, capture_output=True, text=True,
            timeout=120, cwd=tmpdir, env=env
        )

        if result.returncode != 0:
            raise RuntimeError(f'Claude Code error: {result.stderr[:200]}')

        data = json.loads(result.stdout)
        if data.get('is_error'):
            raise RuntimeError(data.get('result', 'Unknown error'))
        return data.get('result', '')


@app.route('/')
def index():
    return send_from_directory(STATIC_DIR, 'index.html')


RECOGNIZE_PROMPT = (
    'You are a warm, playful AI friend talking to a young child (age 2-5) '
    'who just drew a picture. Look at their drawing and react with genuine '
    'excitement. Guess what they drew in 1-2 short, simple sentences. '
    'Use 1-2 emojis. Ask if you guessed right. Keep it very simple — '
    'short words, big feelings.\n\n'
    'IMPORTANT: On the very last line, write SUBJECT: followed by 1-3 words '
    'naming what you think it is (e.g. SUBJECT: butterfly).'
)


@app.route('/api/recognize', methods=['POST'])
def recognize():
    data = request.json
    image_b64 = data.get('image', '')
    try:
        text = claude(RECOGNIZE_PROMPT, image_b64)
        subject, message = '', text
        for line in text.split('\n'):
            if line.strip().upper().startswith('SUBJECT:'):
                subject = line.split(':', 1)[1].strip()
                message = text[:text.rfind(line)].strip()
                break
        return jsonify({'message': message, 'subject': subject})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/generate-prompt', methods=['POST'])
def generate_prompt():
    data = request.json
    subject = data.get('subject', '')
    style = data.get('style', '')
    mode = data.get('mode', 'reimagine')

    if mode == 'faithful':
        prompt = (f'Write a 1-sentence image generation prompt that faithfully '
                  f'recreates a child\'s drawing of: {subject}. '
                  f'Keep it simple and childlike. Output ONLY the prompt, nothing else.')
    else:
        prompt = (f'Write a vivid 2-3 sentence image generation prompt that brings '
                  f'"{subject}" to life as magical, beautiful artwork a child would love. '
                  f'{("Style: " + style + ". ") if style else ""}'
                  f'Output ONLY the prompt, nothing else.')
    try:
        return jsonify({'prompt': claude(prompt)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/animate-prompt', methods=['POST'])
def animate_prompt():
    data = request.json
    subject = data.get('subject', '')
    mode = data.get('mode', 'reimagine')

    if mode == 'faithful':
        prompt = (f'Write a 1-2 sentence animation prompt for gentle, subtle motion '
                  f'of {subject}. Small movements, breathing, swaying. '
                  f'Output ONLY the prompt, nothing else.')
    else:
        prompt = (f'Write a vivid, cinematic 2-3 sentence animation prompt for '
                  f'{subject} coming fully to life with creative, dramatic motion. '
                  f'Characters moving, interacting, surprises — a child would be '
                  f'delighted. Output ONLY the prompt, nothing else.')
    try:
        return jsonify({'prompt': claude(prompt)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8091))
    app.run(host='0.0.0.0', port=port, debug=True)
