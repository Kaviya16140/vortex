const canvas = document.getElementById('vortex');
const ctx = canvas.getContext('2d', { alpha: true });

/** @typedef {{ ch: string, ring: number, theta0: number, r0: number, size: number, hue: number, w: number }} Glyph */
/** @typedef {{ text: string, createdAt: number, seed: number, glyphs: Glyph[] }} Swirl */

/** @type {Swirl[]} */
const swirls = [];

const state = {
  dpr: 1,
  w: 0,
  h: 0,
  cx: 0,
  cy: 0,
  now: performance.now(),
};

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function resize() {
  const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
  const w = Math.floor(window.innerWidth);
  const h = Math.floor(window.innerHeight);

  state.dpr = dpr;
  state.w = w;
  state.h = h;
  state.cx = w / 2;
  state.cy = h / 2;

  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawBackground(t) {
  ctx.clearRect(0, 0, state.w, state.h);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, state.w, state.h);

  // faint vortex guide rings
  ctx.save();
  ctx.translate(state.cx, state.cy);
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  const maxR = Math.min(state.w, state.h) * 0.62;
  for (let i = 1; i <= 9; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, (maxR * i) / 9, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function makeSwirl(text) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return;

  const seed = (Math.random() * 1e9) | 0;
  const rand = mulberry32(seed);

  const baseFont = clamp(Math.min(state.w, state.h) * 0.042, 18, 42);
  const ringGap = clamp(baseFont * 1.25, 20, 44);
  const maxR = Math.min(state.w, state.h) * 0.56;
  const maxRings = Math.max(3, Math.floor(maxR / ringGap));

  const chars = Array.from(trimmed);
  const rings = clamp(Math.ceil(chars.length / 18), 1, maxRings);
  const glyphs = [];

  const ringCounts = new Array(rings).fill(0);
  for (let i = 0; i < chars.length; i++) ringCounts[i % rings]++;

  const ringUsed = new Array(rings).fill(0);
  const spinDir = rand() < 0.5 ? -1 : 1;
  const hue0 = rand() * 360;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const ring = i % rings;
    const count = ringCounts[ring];
    const idx = ringUsed[ring]++;

    const r0 = ringGap * (ring + 1) * (0.92 + 0.12 * rand());
    const jitter = (rand() - 0.5) * 0.22;
    const theta0 = ((idx + jitter) / count) * Math.PI * 2;

    const size = baseFont * (0.92 + 0.18 * rand());
    const hue = (hue0 + ring * 14 + i * 2.2) % 360;
    const w = (0.85 + 0.25 * rand()) * spinDir;

    glyphs.push({ ch, ring, theta0, r0, size, hue, w });
  }

  swirls.push({
    text: trimmed,
    createdAt: performance.now(),
    seed,
    glyphs,
  });
}

function render(t) {
  state.now = t;
  drawBackground(t);

  const centerWobble = 8 * Math.sin(t * 0.0007);
  const cx = state.cx + centerWobble;
  const cy = state.cy + centerWobble * 0.55;

  ctx.save();
  ctx.translate(cx, cy);

  const L = 3200; // total lifetime
  const fadeIn = 180;
  const fadeOut = 650;

  for (let s = swirls.length - 1; s >= 0; s--) {
    const swirl = swirls[s];
    const age = t - swirl.createdAt;
    if (age > L) {
      swirls.splice(s, 1);
      continue;
    }

    const p = clamp(age / L, 0, 1);

    // radius collapses faster near the end
    const shrink = Math.pow(1 - p, 1.9);
    const twist = 11.0 * p * p + 1.1 * p;
    const spin = (age * 0.00165) * (0.85 + 2.7 * p);

    const alphaIn = clamp(age / fadeIn, 0, 1);
    const alphaOut = clamp((L - age) / fadeOut, 0, 1);
    const alpha = alphaIn * alphaOut;

    // draw a faint core glow
    ctx.save();
    ctx.globalAlpha = 0.22 * alpha;
    const core = 16 + 140 * (1 - shrink);
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, core);
    cg.addColorStop(0, 'rgba(125, 211, 252, 0.38)');
    cg.addColorStop(1, 'rgba(125, 211, 252, 0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(0, 0, core, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    for (const g of swirl.glyphs) {
      const r = g.r0 * (0.12 + 0.88 * shrink);
      const theta = g.theta0 + spin * g.w + twist + (1 - shrink) * 2.0 * g.w;

      // spiral into a vortex curve
      const spiralPull = (1 - shrink) * (34 + 140 * p);
      const x = Math.cos(theta) * r;
      const y = Math.sin(theta) * r;
      const vx = Math.cos(theta + Math.PI / 2) * spiralPull;
      const vy = Math.sin(theta + Math.PI / 2) * spiralPull;

      ctx.save();
      ctx.translate(x + vx, y + vy);
      ctx.rotate(theta + Math.PI / 2);

      const blur = (1 - shrink) * 10;
      ctx.shadowColor = `hsla(${g.hue}, 90%, 72%, ${0.35 * alpha})`;
      ctx.shadowBlur = blur;

      ctx.globalAlpha = alpha * (0.8 + 0.2 * Math.sin(theta * 2 + t * 0.003));
      ctx.fillStyle = `hsla(${g.hue}, 90%, 78%, 1)`;
      ctx.font = `${Math.round(g.size)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // slight squeeze as it disappears
      const squeeze = 1 - 0.55 * (1 - shrink);
      ctx.scale(squeeze, 1);
      ctx.fillText(g.ch, 0, 0);
      ctx.restore();
    }
  }

  ctx.restore();
  requestAnimationFrame(render);
}

function wireUI() {
  const input = document.getElementById('textInput');
  const wrap = document.getElementById('typingWrap');
  const typingText = document.getElementById('typingText');

  const EAT_DELAY_MS = 3000;
  const VORTEX_START_DELAY_MS = 2000;

  /** @type {{ id: number, text: string, expiresAt: number }[]} */
  let queue = [];
  let nextId = 1;

  let vortexEnabled = false;
  let vortexTimer = null;
  /** @type {string[]} */
  let pendingForVortex = [];

  const syncInputFromQueue = () => {
    const v = queue.map((q) => q.text).join('');
    if (input.value !== v) input.value = v;
    if (typingText) typingText.textContent = v;
  };

  const clear = () => {
    queue = [];
    input.value = '';
    pendingForVortex = [];
    vortexEnabled = false;
    if (vortexTimer != null) {
      window.clearTimeout(vortexTimer);
      vortexTimer = null;
    }
    input.focus();
  };

  const ensureVortexTimer = () => {
    if (vortexEnabled) return;
    if (vortexTimer != null) return;
    vortexTimer = window.setTimeout(() => {
      vortexEnabled = true;
      vortexTimer = null;
      if (pendingForVortex.length > 0) {
        for (const chunk of pendingForVortex) {
          const chunkSize = chunk.length > 32 ? 12 : 32;
          for (let i = 0; i < chunk.length; i += chunkSize) {
            makeSwirl(chunk.slice(i, i + chunkSize));
          }
        }
        pendingForVortex = [];
      }
    }, VORTEX_START_DELAY_MS);
  };

  const spawnOrQueueForVortex = (data) => {
    if (!data) return;
    ensureVortexTimer();
    if (!vortexEnabled) {
      pendingForVortex.push(data);
      return;
    }

    const chunkSize = data.length > 32 ? 12 : 32;
    for (let i = 0; i < data.length; i += chunkSize) {
      makeSwirl(data.slice(i, i + chunkSize));
    }
  };

  const eatExpired = () => {
    const now = performance.now();
    const before = queue.length;
    queue = queue.filter((q) => q.expiresAt > now);
    if (queue.length !== before) syncInputFromQueue();
  };

  // consume loop
  window.setInterval(eatExpired, 60);

  // Intercept text before it lands in the input so we can control the buffer.
  input.addEventListener('beforeinput', (e) => {
    // Allow composition to go through (IME). We'll handle the final commit on input.
    if (e.isComposing) return;

    if (e.inputType === 'insertText' || e.inputType === 'insertFromPaste') {
      const data = e.data ?? '';
      if (!data) return;
      e.preventDefault();

      // vortex starts after a short delay from first typing
      spawnOrQueueForVortex(data);

      queue.push({ id: nextId++, text: data, expiresAt: performance.now() + EAT_DELAY_MS });
      syncInputFromQueue();
      return;
    }

    if (e.inputType === 'deleteContentBackward') {
      e.preventDefault();
      // Remove from the end of the visible buffer (doesn't affect already-swirled letters).
      if (queue.length === 0) return;
      const last = queue[queue.length - 1];
      if (last.text.length <= 1) queue.pop();
      else last.text = last.text.slice(0, -1);
      syncInputFromQueue();
      return;
    }
  });

  // Fallback for IME composition commits: if something changed, treat the whole
  // input as new text and re-buffer it.
  input.addEventListener('input', () => {
    if (!input.value) return;
    const data = input.value;
    input.value = '';
    spawnOrQueueForVortex(data);
    queue.push({ id: nextId++, text: data, expiresAt: performance.now() + EAT_DELAY_MS });
    syncInputFromQueue();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clear();
    }
  });

  // start with focus for quick try
  setTimeout(() => input.focus(), 50);

  if (wrap) {
    wrap.addEventListener('pointerdown', () => input.focus());
  }
}

window.addEventListener('resize', resize, { passive: true });
resize();
wireUI();
requestAnimationFrame(render);

