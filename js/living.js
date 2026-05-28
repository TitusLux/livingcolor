// "Living image" effect — combines breathing, parallax, sparkles, and color shifts
// to make a still AI image feel animated. Client-side, no GPU/server needed.

import { log } from './logger.js';

let activeAnim = null;

export function stopLiving() {
  if (activeAnim) {
    cancelAnimationFrame(activeAnim);
    activeAnim = null;
  }
}

// Apply living effect to an image bubble in the chat.
// imgEl: the <img> element to bring to life.
// motionPlan (optional): Claude-generated motion plan with layers + transforms.
//   { duration_ms, loop, layers: [{ name, transforms: [{type, axis, amplitude, period_ms, easing}] }] }
export function makeAlive(imgEl, motionPlan) {
  if (!imgEl || !imgEl.complete) return;
  log('living', 'starting living effect', { hasPlan: !!motionPlan });
  stopLiving();

  const parent = imgEl.parentElement;
  parent.style.position = 'relative';
  parent.style.overflow = 'hidden';

  // Layer for particles
  const particleCanvas = document.createElement('canvas');
  particleCanvas.style.cssText = `
    position: absolute; top: 0; left: 0;
    width: 100%; height: 100%;
    pointer-events: none; z-index: 2;
  `;
  parent.appendChild(particleCanvas);

  const w = imgEl.offsetWidth || 400;
  const h = imgEl.offsetHeight || 400;
  particleCanvas.width = w;
  particleCanvas.height = h;
  const pctx = particleCanvas.getContext('2d');

  // Create sparkles
  const particles = [];
  for (let i = 0; i < 25; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -Math.random() * 0.5 - 0.1,
      size: Math.random() * 2.5 + 0.5,
      life: Math.random(),
      lifeSpeed: Math.random() * 0.005 + 0.003,
      hue: Math.random() * 60 + 40,  // warm yellows/golds
    });
  }

  // Apply breathing + tilt to image
  imgEl.style.transformOrigin = 'center center';
  imgEl.style.transition = 'none';

  // Default plan if Claude didn't provide one
  const plan = motionPlan || {
    duration_ms: 4000,
    loop: true,
    layers: [{
      name: 'whole_image',
      transforms: [
        { type: 'translate', axis: 'y', amplitude: 4, period_ms: 3000, easing: 'sine' },
        { type: 'rotate', amplitude: 0.6, period_ms: 4000, easing: 'sine' },
        { type: 'scale', amplitude: 0.015, period_ms: 2500, easing: 'sine' },
      ],
    }],
  };

  const startTime = performance.now();

  function evalTransform(tr, elapsedMs) {
    const phase = (elapsedMs % tr.period_ms) / tr.period_ms; // 0..1
    let v;
    if (tr.easing === 'linear') v = phase * 2 - 1;
    else if (tr.easing === 'ease') v = phase < 0.5 ? 2 * phase * phase : 1 - Math.pow(-2 * phase + 2, 2) / 2;
    else v = Math.sin(phase * Math.PI * 2); // sine default
    return v * tr.amplitude;
  }

  function animate() {
    const now = performance.now();
    const elapsed = now - startTime;

    // Apply transforms from the first layer (whole-image for now)
    const layer = plan.layers[0];
    let tx = 0, ty = 0, rot = 0, scale = 1;
    for (const tr of layer.transforms) {
      const v = evalTransform(tr, elapsed);
      if (tr.type === 'translate') {
        if (tr.axis === 'x') tx += v;
        else ty += v;
      } else if (tr.type === 'rotate') {
        rot += v;
      } else if (tr.type === 'scale') {
        scale += v;
      }
    }
    imgEl.style.transform =
      `translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${scale})`;

    // Sparkles for the particle layer
    const t = elapsed * 0.001;

    // Particles
    pctx.clearRect(0, 0, w, h);
    for (const p of particles) {
      p.x += p.vx + Math.sin(t + p.life * 8) * 0.15;
      p.y += p.vy;
      p.life -= p.lifeSpeed;

      if (p.life <= 0 || p.y < -5) {
        p.x = Math.random() * w;
        p.y = h + 5;
        p.life = 1;
        p.hue = Math.random() * 60 + 40;
      }

      const alpha = Math.sin(p.life * Math.PI);
      const glow = p.size * 4;

      // Glow
      pctx.save();
      pctx.globalAlpha = alpha * 0.25;
      pctx.fillStyle = `hsl(${p.hue}, 100%, 70%)`;
      pctx.beginPath();
      pctx.arc(p.x, p.y, glow, 0, Math.PI * 2);
      pctx.fill();

      // Core
      pctx.globalAlpha = alpha;
      pctx.fillStyle = `hsl(${p.hue}, 100%, 95%)`;
      pctx.beginPath();
      pctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      pctx.fill();
      pctx.restore();
    }

    activeAnim = requestAnimationFrame(animate);
  }

  activeAnim = requestAnimationFrame(animate);
}
