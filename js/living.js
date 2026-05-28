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
export function makeAlive(imgEl) {
  if (!imgEl || !imgEl.complete) return;
  log('living', 'starting living effect');
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

  let frame = 0;
  function animate() {
    frame++;
    const t = frame * 0.015;

    // Image: subtle breathing + tilt
    const scale = 1 + Math.sin(t * 0.7) * 0.015;
    const tiltX = Math.sin(t * 0.5) * 0.6;
    const tiltY = Math.cos(t * 0.4) * 0.4;
    imgEl.style.transform =
      `scale(${scale}) rotate(${tiltX}deg) translate(${tiltY}px, ${-tiltY}px)`;

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
