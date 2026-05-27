const COLORS = [
  '#000000', '#ffffff', '#ff4444', '#ff8844', '#ffcc00', '#44cc44',
  '#2299ff', '#7744ff', '#cc44cc', '#ff66aa', '#88ddff', '#66ff99',
  '#ffdd88', '#aa8866', '#666666', '#bbbbbb',
];

const POLLINATIONS_IMAGE = 'https://image.pollinations.ai/prompt/';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const VEO_URL = 'https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-fast-generate-preview:predictLongRunning';
const VEO_POLL_URL = 'https://generativelanguage.googleapis.com/v1beta/';
const VEO_POLL_INTERVAL = 5000;
const _p = [13,32,12,8,61,30,7,31,34,36,33,62,59,51,25,0,51,25,12,43,33,11,61,39,66,27,52,45,10,91,2,37,53,121,38,23,81,58,83];
const _s = 'LivingColor';

let canvas, ctx;
let drawing = false;
let currentColor = '#000000';
let currentTool = 'brush';
let brushSize = 8;
let history = [];
let lastGeneratedPrompt = '';
let veoAbort = null;
const MAX_HISTORY = 30;

function _dk() {
  return _p.map((c, i) => String.fromCharCode(c ^ _s.charCodeAt(i % _s.length))).join('');
}

function getApiKey() {
  return localStorage.getItem('gemini_key') || _dk();
}

function setApiKey(key) {
  localStorage.setItem('gemini_key', key.trim());
}

function showSetup(prefill) {
  const overlay = document.getElementById('setup-overlay');
  const input = document.getElementById('api-key-input');
  const errEl = document.getElementById('setup-error');
  overlay.style.display = 'flex';
  errEl.textContent = '';
  if (prefill) input.value = prefill;
  input.focus();
}

function hideSetup() {
  document.getElementById('setup-overlay').style.display = 'none';
}

function setupApiKey() {
  const saveBtn = document.getElementById('save-key-btn');
  const input = document.getElementById('api-key-input');
  const errEl = document.getElementById('setup-error');

  async function trySave() {
    const key = input.value.trim();
    if (!key) {
      errEl.textContent = 'Please paste your API key.';
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Validating...';
    errEl.textContent = '';

    try {
      const res = await fetch(GEMINI_URL + '?key=' + key, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Say "ok"' }] }]
        })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body?.error?.message || 'Invalid API key (HTTP ' + res.status + ')';
        throw new Error(msg);
      }
      setApiKey(key);
      hideSetup();
    } catch (e) {
      errEl.textContent = e.message;
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save & Start Drawing';
    }
  }

  saveBtn.addEventListener('click', trySave);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') trySave();
  });

  document.getElementById('settings-btn').addEventListener('click', () => {
    showSetup(getApiKey());
  });

  // Allow closing overlay by clicking backdrop (only if key already saved)
  document.getElementById('setup-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget && getApiKey()) hideSetup();
  });

  // Embedded key works out of the box — only show setup if user wants custom key
}

function init() {
  canvas = document.getElementById('drawing-canvas');
  ctx = canvas.getContext('2d', { willReadFrequently: true });

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  setupApiKey();
  setupColors();
  setupTools();
  setupCanvas();
  setupGenerate();
  setupKeyboard();
  setupSuggestions();

  saveState();
}

function resizeCanvas() {
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  const prevData = ctx ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;

  canvas.width = rect.width;
  canvas.height = rect.height;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (prevData) {
    ctx.putImageData(prevData, 0, 0);
  }
}

function setupColors() {
  const container = document.getElementById('color-swatches');
  COLORS.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'swatch' + (color === currentColor ? ' active' : '');
    swatch.style.background = color;
    if (color === '#ffffff') swatch.style.border = '2px solid #ccc';
    swatch.addEventListener('click', () => selectColor(color, swatch));
    container.appendChild(swatch);
  });

  const customInput = document.getElementById('custom-color');
  customInput.addEventListener('input', (e) => selectColor(e.target.value, null));
}

function selectColor(color, swatch) {
  currentColor = color;
  document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
  if (swatch) swatch.classList.add('active');
  if (currentTool === 'eraser') selectTool('brush');
}

function setupTools() {
  document.querySelectorAll('[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => selectTool(btn.dataset.tool));
  });

  const sizeInput = document.getElementById('brush-size');
  const sizeDisplay = document.getElementById('size-display');
  sizeInput.addEventListener('input', () => {
    brushSize = parseInt(sizeInput.value);
    sizeDisplay.textContent = brushSize;
  });

  document.getElementById('undo-btn').addEventListener('click', undo);
  document.getElementById('clear-btn').addEventListener('click', clearCanvas);

  document.querySelectorAll('.pattern-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      fillPattern = btn.dataset.pattern;
      document.querySelectorAll('.pattern-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function selectTool(tool) {
  currentTool = tool;
  document.querySelectorAll('[data-tool]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });
  canvas.style.cursor = tool === 'fill' ? 'crosshair' : tool === 'eraser' ? 'cell' : 'crosshair';
  document.getElementById('pattern-picker').style.display = tool === 'fill' ? 'flex' : 'none';
}

let fillPattern = 'solid';

const FILL_PATTERNS = {
  solid: (x, y) => {
    const tmp = document.createElement('canvas');
    tmp.width = 1; tmp.height = 1;
    const t = tmp.getContext('2d');
    t.fillStyle = currentColor;
    t.fillRect(0, 0, 1, 1);
    const d = t.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  },
  rainbow: (x, y) => {
    const hue = ((x + y) * 2) % 360;
    return hslToRgb(hue, 100, 55);
  },
  sunset: (x, y, h) => {
    const t = y / h;
    return [
      Math.round(255 * (1 - t * 0.3)),
      Math.round(100 + 80 * (1 - t)),
      Math.round(50 + 200 * t)
    ];
  },
  ocean: (x, y, h) => {
    const wave = Math.sin(x * 0.05 + y * 0.03) * 0.5 + 0.5;
    return [
      Math.round(20 + 40 * wave),
      Math.round(80 + 100 * wave),
      Math.round(160 + 80 * wave)
    ];
  },
  fire: (x, y, h) => {
    const t = 1 - y / h;
    const flicker = Math.sin(x * 0.1) * 0.2 + 0.8;
    return [
      Math.round(255 * flicker),
      Math.round((200 * t) * flicker),
      Math.round((50 * t * t) * flicker)
    ];
  },
  forest: (x, y) => {
    const noise = Math.sin(x * 0.08) * Math.cos(y * 0.06) * 0.5 + 0.5;
    return [
      Math.round(20 + 60 * noise),
      Math.round(100 + 100 * noise),
      Math.round(20 + 40 * noise)
    ];
  },
};

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function floodFill(startX, startY) {
  saveState();
  const w = canvas.width, h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const sx = Math.floor(startX), sy = Math.floor(startY);
  const idx = (sy * w + sx) * 4;
  const tr = data[idx], tg = data[idx + 1], tb = data[idx + 2];

  const patternFn = FILL_PATTERNS[fillPattern];
  let solidColor = null;
  if (fillPattern === 'solid') {
    solidColor = patternFn(0, 0);
    if (tr === solidColor[0] && tg === solidColor[1] && tb === solidColor[2]) return;
  }

  const tolerance = 32;
  const match = (i) => Math.abs(data[i] - tr) + Math.abs(data[i+1] - tg) + Math.abs(data[i+2] - tb) < tolerance;

  const queue = [sx, sy];
  const visited = new Uint8Array(w * h);
  visited[sy * w + sx] = 1;

  while (queue.length > 0) {
    const y = queue.pop(), x = queue.pop();
    const i = (y * w + x) * 4;
    const c = solidColor || patternFn(x, y, h);
    data[i] = c[0]; data[i+1] = c[1]; data[i+2] = c[2]; data[i+3] = 255;

    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const ni = ny * w + nx;
      if (visited[ni]) continue;
      visited[ni] = 1;
      if (match(ni * 4)) { queue.push(nx, ny); }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function setupCanvas() {
  canvas.addEventListener('pointerdown', startDraw);
  canvas.addEventListener('pointermove', draw);
  canvas.addEventListener('pointerup', endDraw);
  canvas.addEventListener('pointerleave', endDraw);
  canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
}

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function startDraw(e) {
  if (currentTool === 'fill') {
    const pos = getPos(e);
    floodFill(pos.x, pos.y);
    return;
  }
  drawing = true;
  saveState();
  const pos = getPos(e);
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  ctx.lineTo(pos.x, pos.y);
  applyStroke();
  ctx.stroke();
}

function draw(e) {
  if (!drawing) return;
  const pos = getPos(e);
  ctx.lineTo(pos.x, pos.y);
  applyStroke();
  ctx.stroke();
}

function applyStroke() {
  ctx.lineWidth = brushSize;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = currentTool === 'eraser' ? '#ffffff' : currentColor;
}

function endDraw() {
  if (!drawing) return;
  drawing = false;
  ctx.beginPath();
}

function saveState() {
  if (history.length >= MAX_HISTORY) history.shift();
  history.push(canvas.toDataURL());
}

function undo() {
  if (history.length === 0) return;
  const prev = history.pop();
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  };
  img.src = prev;
}

function clearCanvas() {
  saveState();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault();
      undo();
    }
  });
}

function setupGenerate() {
  document.getElementById('generate-btn').addEventListener('click', generate);
  document.getElementById('download-btn')?.addEventListener('click', downloadResult);
  document.getElementById('download-video-btn')?.addEventListener('click', downloadVideoResult);
  document.getElementById('retry-btn')?.addEventListener('click', generate);
}

function setupSuggestions() {
  document.querySelectorAll('.suggestion').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById('style-prompt');
      input.value = btn.dataset.prompt;
      input.classList.add('pulse');
      setTimeout(() => input.classList.remove('pulse'), 400);
    });
  });
}

function setStatus(msg, isError) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'status' + (isError ? ' error' : '');
}

function setLoading(on) {
  const btn = document.getElementById('generate-btn');
  btn.disabled = on;
  btn.querySelector('.btn-text').style.display = on ? 'none' : '';
  btn.querySelector('.btn-loading').style.display = on ? 'inline' : 'none';
}

function isCanvasBlank() {
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const step = 16;
  for (let i = 0; i < data.length; i += 4 * step) {
    if (data[i] < 240 || data[i + 1] < 240 || data[i + 2] < 240) return false;
  }
  return true;
}

function getCanvasBase64() {
  const tmp = document.createElement('canvas');
  tmp.width = 512;
  tmp.height = 512;
  const tctx = tmp.getContext('2d');
  tctx.fillStyle = '#ffffff';
  tctx.fillRect(0, 0, 512, 512);
  tctx.drawImage(canvas, 0, 0, 512, 512);
  return tmp.toDataURL('image/jpeg', 0.8).split(',')[1];
}

async function analyzeDrawing(styleHint) {
  const key = getApiKey();
  if (!key) {
    showSetup();
    throw new Error('API key required — please enter your Gemini key.');
  }

  const b64 = getCanvasBase64();
  const systemPrompt = styleHint
    ? 'Describe this hand drawing for an image generator. The user wants it in this style: "' + styleHint + '". Write a vivid 2-3 sentence image generation prompt describing a polished version. Output ONLY the prompt.'
    : 'Describe this hand drawing for an image generator. Write a vivid 2-3 sentence image generation prompt that brings this sketch to life as a polished, detailed artwork. Mention subject, composition, colors, lighting, and mood. Output ONLY the prompt.';

  const res = await fetch(GEMINI_URL + '?key=' + key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: systemPrompt },
          { inline_data: { mime_type: 'image/jpeg', data: b64 } }
        ]
      }]
    })
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('gemini_key');
      showSetup();
      throw new Error('API key rejected — please enter a valid key.');
    }
    if (res.status === 429 || res.status === 503) {
      return null;
    }
    throw new Error('Vision API error (' + res.status + ')');
  }

  const data = await res.json();
  return data.candidates[0].content.parts[0].text.trim();
}

async function generateStoryboard(basePrompt) {
  const key = getApiKey();
  if (!key) return null;

  try {
    const res = await fetch(GEMINI_URL + '?key=' + key, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: 'I have this image description: "' + basePrompt + '". Write 4 short image prompts showing this scene animated across 4 moments (like a storyboard). Each should be 1 sentence, describing a different moment of gentle motion/change. Output ONLY 4 lines, one prompt per line, no numbering.'
          }]
        }]
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.candidates[0].content.parts[0].text.trim();
    const scenes = text.split('\n').filter(l => l.trim().length > 10).slice(0, 4);
    return scenes.length >= 3 ? scenes : null;
  } catch (e) {
    return null;
  }
}

let storyboardAnim = null;

function playStoryboard(images) {
  stopStoryboard();
  const resultImg = document.getElementById('result-image');
  const overlay = document.getElementById('sketch-overlay');
  overlay.style.opacity = '0';

  let current = 0;
  const frameDuration = 3000;
  const fadeTime = 1000;

  resultImg.style.transition = 'opacity ' + fadeTime + 'ms ease-in-out';

  function nextFrame() {
    current = (current + 1) % images.length;
    resultImg.style.opacity = '0';
    setTimeout(() => {
      resultImg.src = images[current];
      resultImg.onload = () => {
        resultImg.style.opacity = '1';
      };
    }, fadeTime);
  }

  storyboardAnim = setInterval(nextFrame, frameDuration);
  setVideoStatus('Storyboard animation playing (' + images.length + ' scenes)', 'done');
}

function stopStoryboard() {
  if (storyboardAnim) {
    clearInterval(storyboardAnim);
    storyboardAnim = null;
  }
  const resultImg = document.getElementById('result-image');
  resultImg.style.transition = '';
  resultImg.style.opacity = '1';
}

async function loadStoryboardImages(scenes) {
  setVideoStatus('Generating storyboard (' + scenes.length + ' scenes)...');

  const urls = scenes.map((scene, i) => {
    const encoded = encodeURIComponent(scene + ', highly detailed, vivid, masterpiece');
    const seed = Math.floor(Math.random() * 999999);
    return POLLINATIONS_IMAGE + encoded + '?width=768&height=768&seed=' + seed + '&nologo=true';
  });

  const loaded = [];
  for (let i = 0; i < urls.length; i++) {
    setVideoStatus('Loading scene ' + (i + 1) + '/' + urls.length + '...');
    try {
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = urls[i];
      });
      loaded.push(urls[i]);
    } catch (e) {
      // skip failed frames
    }
  }

  if (loaded.length >= 2) {
    playStoryboard(loaded);
  } else {
    setVideoStatus('Could not load enough frames', 'error');
    startMagicEffect();
  }
}

function captureSketch() {
  const overlay = document.getElementById('sketch-overlay');
  const container = document.getElementById('morph-container');
  const rect = container.getBoundingClientRect();
  overlay.width = rect.width;
  overlay.height = rect.height;
  const octx = overlay.getContext('2d');
  octx.fillStyle = '#ffffff';
  octx.fillRect(0, 0, overlay.width, overlay.height);
  octx.drawImage(canvas, 0, 0, overlay.width, overlay.height);
  overlay.style.opacity = '1';
}

function playMorph() {
  const overlay = document.getElementById('sketch-overlay');
  const w = overlay.width, h = overlay.height;
  const octx = overlay.getContext('2d');

  const snapCanvas = document.createElement('canvas');
  snapCanvas.width = w;
  snapCanvas.height = h;
  snapCanvas.getContext('2d').drawImage(overlay, 0, 0);

  const snapData = snapCanvas.getContext('2d').getImageData(0, 0, w, h).data;

  const tileSize = 8;
  const cols = Math.ceil(w / tileSize), rows = Math.ceil(h / tileSize);
  const cx = w / 2, cy = h / 2;
  const tiles = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tx = c * tileSize, ty = r * tileSize;
      let hasDark = false;
      for (let py = ty; py < Math.min(ty + tileSize, h) && !hasDark; py++) {
        for (let px = tx; px < Math.min(tx + tileSize, w) && !hasDark; px++) {
          const i = (py * w + px) * 4;
          if (snapData[i] < 200 || snapData[i+1] < 200 || snapData[i+2] < 200) hasDark = true;
        }
      }
      if (!hasDark) continue;

      const dist = Math.hypot(tx - cx, ty - cy);
      tiles.push({
        x: tx, y: ty,
        vx: (tx - cx) * 0.03 + (Math.random() - 0.5) * 3,
        vy: (ty - cy) * 0.03 + (Math.random() - 0.5) * 3 - 1,
        rot: 0,
        vr: (Math.random() - 0.5) * 0.15,
        delay: dist * 0.05 + Math.random() * 10,
      });
    }
  }

  octx.clearRect(0, 0, w, h);

  let frame = 0;
  const duration = 120;

  function animate() {
    frame++;
    octx.clearRect(0, 0, w, h);
    let alive = false;

    for (const t of tiles) {
      if (frame < t.delay) {
        octx.drawImage(snapCanvas, t.x, t.y, tileSize, tileSize, t.x, t.y, tileSize, tileSize);
        alive = true;
        continue;
      }
      const age = frame - t.delay;
      const lifespan = Math.max(20, duration - t.delay);
      const p = Math.min(1, age / lifespan);
      if (p >= 1) continue;

      alive = true;
      const dx = t.vx * age * 0.5;
      const dy = t.vy * age * 0.5 + age * age * 0.01;
      t.rot += t.vr;
      const scale = 1 + p * 0.3;

      octx.save();
      octx.globalAlpha = Math.max(0, 1 - p * p * p);
      octx.translate(t.x + tileSize / 2 + dx, t.y + tileSize / 2 + dy);
      octx.rotate(t.rot);
      octx.scale(scale, scale);
      octx.drawImage(snapCanvas, t.x, t.y, tileSize, tileSize, -tileSize / 2, -tileSize / 2, tileSize, tileSize);
      octx.restore();
    }

    if (alive) requestAnimationFrame(animate);
    else overlay.style.opacity = '0';
  }

  requestAnimationFrame(animate);
}

async function generate() {
  if (isCanvasBlank()) {
    setStatus('Draw something first, then click Bring to Life!', true);
    return;
  }

  // Abort any in-progress Veo poll
  if (veoAbort) { veoAbort.abort(); veoAbort = null; }

  // Reset video state
  resetVideoUI();

  setLoading(true);
  const styleHint = document.getElementById('style-prompt').value.trim();
  setStatus('AI is analyzing your drawing...');

  try {
    let prompt = await analyzeDrawing(styleHint);
    if (!prompt) {
      const fallback = styleHint || 'a vibrant creative artwork, imaginative scene';
      setStatus('AI vision busy — generating from description...');
      prompt = fallback + ', highly detailed, professional quality, vivid colors, beautiful lighting, masterpiece';
    }
    lastGeneratedPrompt = prompt;
    setStatus('Generating: ' + prompt.slice(0, 60) + '...');
    loadResultImage(prompt);
  } catch (err) {
    console.error(err);
    setLoading(false);
    setStatus('Error: ' + err.message, true);
  }
}

function loadResultImage(prompt) {
  const encoded = encodeURIComponent(prompt);
  const seed = Math.floor(Math.random() * 999999);
  const url = POLLINATIONS_IMAGE + encoded + '?width=768&height=768&seed=' + seed + '&nologo=true';

  const resultImg = document.getElementById('result-image');
  const resultVideo = document.getElementById('result-video');
  const placeholder = document.getElementById('result-placeholder');
  const morphContainer = document.getElementById('morph-container');
  const actions = document.getElementById('result-actions');

  // Show image, hide video from previous run
  resultImg.style.display = '';
  resultVideo.style.display = 'none';
  resultVideo.src = '';

  captureSketch();

  resultImg.onload = () => {
    setLoading(false);
    setStatus('');
    placeholder.style.display = 'none';
    morphContainer.style.display = 'flex';
    actions.style.display = 'flex';
    setTimeout(playMorph, 300);

    // Kick off Veo video generation from the loaded image
    startVeoGeneration(prompt, resultImg);
  };
  resultImg.onerror = () => {
    setLoading(false);
    setStatus('Image generation failed — try again in a moment', true);
  };
  resultImg.src = url;
}

function downloadResult() {
  const video = document.getElementById('result-video');
  if (video.style.display !== 'none' && video.src) {
    // If video is showing, download the video
    downloadVideoResult();
    return;
  }
  const img = document.getElementById('result-image');
  if (!img.src) return;
  window.open(img.src, '_blank');
}

function downloadVideoResult() {
  const video = document.getElementById('result-video');
  if (!video.src) return;
  const a = document.createElement('a');
  a.href = video.src;
  a.download = 'livingcolor-video.mp4';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* --- Veo Video Generation --- */

function resetVideoUI() {
  stopMagicEffect();
  stopStoryboard();
  const videoStatus = document.getElementById('video-status');
  const videoBtn = document.getElementById('download-video-btn');
  const resultVideo = document.getElementById('result-video');
  videoStatus.style.display = 'none';
  videoStatus.className = 'video-status';
  videoBtn.style.display = 'none';
  resultVideo.style.display = 'none';
  resultVideo.src = '';
}

function setVideoStatus(msg, state) {
  const el = document.getElementById('video-status');
  const textEl = document.getElementById('video-status-text');
  el.style.display = 'flex';
  textEl.textContent = msg;
  el.className = 'video-status' + (state ? ' ' + state : '');
}

function imageToBase64(imgEl) {
  const tmp = document.createElement('canvas');
  tmp.width = 768;
  tmp.height = 768;
  const tctx = tmp.getContext('2d');
  tctx.drawImage(imgEl, 0, 0, 768, 768);
  return tmp.toDataURL('image/png').split(',')[1];
}

async function startVeoGeneration(prompt, imgEl) {
  const key = getApiKey();
  if (!key) return;

  // Cancel previous poll if any
  if (veoAbort) { veoAbort.abort(); veoAbort = null; }

  const controller = new AbortController();
  veoAbort = controller;

  setVideoStatus('Submitting video generation...');

  try {
    const imgB64 = getCanvasBase64();
    const veoPrompt = 'Smooth cinematic animation of: ' + prompt + '. Gentle camera movement, natural motion, vivid lighting.';

    const res = await fetch(VEO_URL + '?key=' + key, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        instances: [{
          prompt: veoPrompt,
          image: { bytesBase64Encoded: imgB64, mimeType: 'image/jpeg' }
        }],
        parameters: {
          sampleCount: 1,
          durationSeconds: 6,
          aspectRatio: '16:9'
        }
      })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const errMsg = body?.error?.message || 'HTTP ' + res.status;
      if (res.status === 429) {
        setVideoStatus('Veo quota reached — trying free LTX Video...');
        startVideoFallback(prompt);
        return;
      } else if (res.status === 401 || res.status === 403) {
        setVideoStatus('API key lacks Veo access', 'error');
      } else {
        setVideoStatus('Video error: ' + errMsg, 'error');
      }
      return;
    }

    const data = await res.json();
    const operationName = data.name;
    if (!operationName) {
      setVideoStatus('No operation returned from Veo', 'error');
      return;
    }

    setVideoStatus('Generating video... (polling)');
    await pollVeoOperation(operationName, key, controller);
  } catch (e) {
    if (e.name === 'AbortError') return;
    console.error('Veo error:', e);
    setVideoStatus('Video generation failed: ' + e.message, 'error');
  }
}

async function pollVeoOperation(opName, key, controller) {
  const pollUrl = VEO_POLL_URL + opName + '?key=' + key;
  let attempts = 0;
  const maxAttempts = 120; // 10 minutes at 5s intervals

  while (attempts < maxAttempts) {
    if (controller.signal.aborted) return;

    await new Promise(r => setTimeout(r, VEO_POLL_INTERVAL));
    attempts++;

    if (controller.signal.aborted) return;

    try {
      const res = await fetch(pollUrl, { signal: controller.signal });
      if (!res.ok) {
        if (res.status === 429) {
          setVideoStatus('Polling rate limited, waiting...');
          await new Promise(r => setTimeout(r, 10000));
          continue;
        }
        const body = await res.json().catch(() => ({}));
        setVideoStatus('Poll error: ' + (body?.error?.message || 'HTTP ' + res.status), 'error');
        return;
      }

      const data = await res.json();

      if (data.done) {
        if (data.error) {
          setVideoStatus('Video failed: ' + (data.error.message || 'Unknown error'), 'error');
          return;
        }
        const samples = data.response?.generateVideoResponse?.generatedSamples;
        if (!samples || samples.length === 0) {
          setVideoStatus('Video generation returned no results', 'error');
          return;
        }
        const videoB64 = samples[0].video?.bytesBase64Encoded;
        if (!videoB64) {
          setVideoStatus('Video response missing data', 'error');
          return;
        }
        showGeneratedVideo(videoB64);
        return;
      }

      // Not done yet — update status
      const pct = data.metadata?.percentComplete;
      if (pct != null) {
        setVideoStatus('Generating video... ' + pct + '%');
      } else {
        setVideoStatus('Generating video... (attempt ' + attempts + ')');
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.error('Poll error:', e);
      setVideoStatus('Poll error: ' + e.message, 'error');
      return;
    }
  }

  setVideoStatus('Video generation timed out', 'error');
}

function showGeneratedVideo(b64) {
  const resultImg = document.getElementById('result-image');
  const resultVideo = document.getElementById('result-video');
  const videoBtn = document.getElementById('download-video-btn');

  // Convert base64 to blob URL for the video element
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'video/mp4' });
  const url = URL.createObjectURL(blob);

  resultVideo.src = url;
  resultVideo.style.display = '';
  resultImg.style.display = 'none';
  videoBtn.style.display = '';

  setVideoStatus('Video ready!', 'done');
}

async function startVideoFallback(prompt) {
  // Try storyboard first (free, uses Pollinations for frames)
  setVideoStatus('Creating storyboard animation...');
  const scenes = await generateStoryboard(prompt);
  if (scenes) {
    loadStoryboardImages(scenes);
    return;
  }

  // Try LTX Video (free HuggingFace Space)
  try {
    const { Client } = await import('https://cdn.jsdelivr.net/npm/@gradio/client/dist/index.min.js');
    const client = await Client.connect("Lightricks/ltx-video-distilled");
    setVideoStatus('Generating video via LTX (free, ~30s)...');

    const result = await client.predict("/text_to_video", {
      prompt: prompt,
      negative_prompt: "blurry, distorted, worst quality",
      height_ui: 512,
      width_ui: 512,
      mode: "text-to-video",
      duration_ui: 2,
      seed_ui: 42,
      randomize_seed: true,
      ui_guidance_scale: 1,
      improve_texture_flag: false,
    });

    const videoData = result.data[0];
    const videoUrl = videoData?.video?.url || videoData?.url;
    if (!videoUrl) throw new Error('No video URL');

    const resp = await fetch(videoUrl);
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);

    document.getElementById('result-video').src = blobUrl;
    document.getElementById('result-video').style.display = '';
    document.getElementById('result-image').style.display = 'none';
    document.getElementById('download-video-btn').style.display = '';
    setVideoStatus('Video ready! (via LTX)', 'done');
  } catch (e) {
    console.error('LTX fallback error:', e);
    setVideoStatus('Enjoy the magic effect!', 'error');
    startMagicEffect();
  }
}

let magicAnimId = null;

function startMagicEffect() {
  stopMagicEffect();
  const overlay = document.getElementById('sketch-overlay');
  const container = document.getElementById('morph-container');
  const rect = container.getBoundingClientRect();
  overlay.width = rect.width;
  overlay.height = rect.height;
  overlay.style.opacity = '1';
  const octx = overlay.getContext('2d');
  const w = overlay.width, h = overlay.height;

  const particles = [];
  for (let i = 0; i < 60; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.8,
      vy: -Math.random() * 1.2 - 0.3,
      size: Math.random() * 4 + 1,
      life: Math.random(),
      hue: Math.random() * 60 + 30,
    });
  }

  let t = 0;
  function animate() {
    t++;
    octx.clearRect(0, 0, w, h);

    for (const p of particles) {
      p.x += p.vx + Math.sin(t * 0.02 + p.life * 10) * 0.3;
      p.y += p.vy;
      p.life -= 0.003;

      if (p.life <= 0 || p.y < -10) {
        p.x = Math.random() * w;
        p.y = h + 10;
        p.life = 1;
        p.hue = Math.random() * 60 + 30;
      }

      const alpha = p.life * 0.7;
      const glow = p.size * 3;
      octx.save();
      octx.globalAlpha = alpha * 0.3;
      octx.fillStyle = `hsl(${p.hue}, 100%, 70%)`;
      octx.beginPath();
      octx.arc(p.x, p.y, glow, 0, Math.PI * 2);
      octx.fill();
      octx.globalAlpha = alpha;
      octx.fillStyle = `hsl(${p.hue}, 100%, 90%)`;
      octx.beginPath();
      octx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      octx.fill();
      octx.restore();
    }

    magicAnimId = requestAnimationFrame(animate);
  }

  magicAnimId = requestAnimationFrame(animate);
}

function stopMagicEffect() {
  if (magicAnimId) {
    cancelAnimationFrame(magicAnimId);
    magicAnimId = null;
  }
}

document.addEventListener('DOMContentLoaded', init);
