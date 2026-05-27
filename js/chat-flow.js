// Conversational flow: recognition, response handling, generation pipeline.

import { GEMINI_URL, POLLINATIONS_IMAGE, setChatSubject, setLastGeneratedPrompt } from './state.js';
import { getApiKey, showSetup } from './setup.js';
import { isCanvasBlank, getCanvasBase64 } from './canvas.js';
import { startVeoGeneration, resetVideoUI } from './video.js';
import {
  appendMessage, removeLoading, showButtons, showEmojiGrid,
  showTextInput, hideButtons, setButtonHandler, hidePlaceholder,
} from './chat.js';

const EMOJI_ITEMS = [
  { emoji: '🦋', label: 'butterfly' }, { emoji: '🐱', label: 'cat' },
  { emoji: '🏠', label: 'house' },     { emoji: '🌳', label: 'tree' },
  { emoji: '🌸', label: 'flower' },     { emoji: '🌅', label: 'sunset' },
  { emoji: '❤️', label: 'heart' },      { emoji: '⛰️', label: 'mountains' },
  { emoji: '🐉', label: 'dragon' },     { emoji: '🚗', label: 'car' },
  { emoji: '🐶', label: 'dog' },        { emoji: '🦄', label: 'unicorn' },
  { emoji: '⭐', label: 'star' },              { emoji: '🌈', label: 'rainbow' },
  { emoji: '🎂', label: 'cake' },       { emoji: '🚀', label: 'rocket' },
];

// Step 1: Send drawing to Gemini for recognition
async function recognizeDrawing() {
  const key = getApiKey();
  if (!key) { showSetup(); throw new Error('API key required'); }
  const b64 = getCanvasBase64();

  const res = await fetch(GEMINI_URL + '?key=' + key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [
        { text: 'You are a warm, playful AI friend talking to a young child (age 2-5) who just drew a picture. Look at their drawing and react with genuine excitement. Guess what they drew in 1-2 short, simple sentences. Use 1-2 emojis. Ask if you guessed right. Keep it very simple -- short words, big feelings. Also output on a separate final line prefixed with "SUBJECT:" the single-word or two-word subject you see (e.g. "SUBJECT: cat").' },
        { inline_data: { mime_type: 'image/jpeg', data: b64 } }
      ]}]
    })
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('gemini_key');
      showSetup();
      throw new Error('API key rejected');
    }
    throw new Error('Vision API error (' + res.status + ')');
  }

  const data = await res.json();
  const text = data.candidates[0].content.parts[0].text.trim();
  // Parse out SUBJECT line
  const lines = text.split('\n');
  const subjectLine = lines.find(l => l.startsWith('SUBJECT:'));
  const subject = subjectLine ? subjectLine.replace('SUBJECT:', '').trim() : '';
  const message = lines.filter(l => !l.startsWith('SUBJECT:')).join('\n').trim();
  return { message, subject };
}

// Step 2: Generate image via Pollinations
function generateImage(subject, styleHint) {
  const prompt = styleHint
    ? subject + ', ' + styleHint + ', highly detailed, vivid colors, beautiful lighting, masterpiece'
    : 'A beautiful, vibrant ' + subject + ', highly detailed, professional quality, vivid colors, beautiful lighting, masterpiece, children illustration style';
  setLastGeneratedPrompt(prompt);

  const encoded = encodeURIComponent(prompt);
  const seed = Math.floor(Math.random() * 999999);
  return {
    url: POLLINATIONS_IMAGE + encoded + '?width=768&height=768&seed=' + seed + '&nologo=true',
    prompt,
  };
}

// Main entry point: start the conversational flow
export async function startChatFlow() {
  if (isCanvasBlank()) {
    appendMessage({ role: 'ai', type: 'text', content: 'Draw something first, then show me! I can\'t wait to see!' });
    return;
  }

  resetVideoUI();
  hidePlaceholder();
  hideButtons();

  appendMessage({ role: 'ai', type: 'loading', content: 'Looking at your drawing...' });

  try {
    const { message, subject } = await recognizeDrawing();
    removeLoading();
    setChatSubject(subject);
    appendMessage({ role: 'ai', type: 'text', content: message });

    showButtons([
      { label: 'Yes! ✅', value: 'yes', color: 'btn-green' },
      { label: 'Hmm, not quite 🤔', value: 'not-quite', color: 'btn-orange' },
      { label: 'It\'s a...', value: 'type-it', color: 'btn-blue' },
    ]);

    setButtonHandler((value, label) => handleStep1Response(value, label, subject));
  } catch (err) {
    removeLoading();
    appendMessage({ role: 'ai', type: 'text', content: 'Oops, I couldn\'t see your drawing! Try again?' });
    console.error(err);
  }
}

function handleStep1Response(value, label, guessedSubject) {
  hideButtons();
  appendMessage({ role: 'user', type: 'text', content: label });

  if (value === 'yes') {
    const subject = guessedSubject || 'drawing';
    setChatSubject(subject);
    appendMessage({ role: 'ai', type: 'text', content: 'Yay! I love your ' + subject + '! Let me make it come alive! ✨🎨' });
    startGeneration(subject);
  } else if (value === 'not-quite') {
    appendMessage({ role: 'ai', type: 'text', content: 'Oops! What is it? I want to see! 👀' });
    showEmojiGrid(EMOJI_ITEMS);
    setButtonHandler((val, display) => handleSubjectPicked(val, display));
  } else if (value === 'type-it') {
    appendMessage({ role: 'ai', type: 'text', content: 'Tell me what you drew! 👀' });
    showTextInput();
    setButtonHandler((val, display) => handleSubjectPicked(val, display));
  }
}

function handleSubjectPicked(subject, display) {
  hideButtons();
  appendMessage({ role: 'user', type: 'text', content: display });
  setChatSubject(subject);
  appendMessage({ role: 'ai', type: 'text', content: 'Oh, a ' + subject + '! Of course! It\'s beautiful! Let me bring it to life! ✨' });
  startGeneration(subject);
}

async function startGeneration(subject) {
  hideButtons();
  appendMessage({ role: 'ai', type: 'loading', content: 'I\'m painting your ' + subject + '... 🎨' });

  const styleHint = document.getElementById('style-prompt').value.trim();
  const { url, prompt } = generateImage(subject, styleHint);

  // Load the image
  const img = new Image();
  img.referrerPolicy = 'no-referrer';
  img.onload = () => {
    removeLoading();
    appendMessage({ role: 'ai', type: 'image', content: url, caption: 'Ta-da! ✨' });
    appendMessage({ role: 'ai', type: 'loading', content: 'Now let me make it move... 🎬' });

    // Store reference for video gen and download
    const resultImg = document.getElementById('result-image');
    if (resultImg) { resultImg.src = url; resultImg.style.display = 'none'; }

    startVideoForChat(prompt, subject);
  };
  img.onerror = () => {
    removeLoading();
    appendMessage({ role: 'ai', type: 'text', content: 'Hmm, the painting didn\'t work. Let\'s try again!' });
  };
  img.src = url;
}

async function startVideoForChat(prompt, subject) {
  try {
    await startVeoGeneration(prompt, null, (videoSrc) => {
      removeLoading();
      appendMessage({ role: 'ai', type: 'video', content: videoSrc, caption: 'Wow! Your ' + subject + ' is alive! 🌟' });
      appendMessage({ role: 'ai', type: 'text', content: 'Do you want to draw something new? 🖍️' });
      showButtons([
        { label: 'Draw again! 🎨', value: 'again', color: 'btn-green' },
      ]);
      setButtonHandler(() => { hideButtons(); });
    });
  } catch (e) {
    removeLoading();
    appendMessage({ role: 'ai', type: 'text', content: 'Your ' + subject + ' is so cool! Do you want to draw something new? 🖍️' });
  }
}
