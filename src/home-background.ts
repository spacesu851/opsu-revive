import { computeRing1Amp, computeRing2Amp, dotHash, noiseVal, prepareHoverRipples, sampleHoverRippleAmp, smoothstep } from './halftone/engine';
import type { HoverRippleBake } from './halftone/engine';
import type { HoverRippleSpawn } from './halftone/types';

type Dot = { x: number; y: number; dx: number; dy: number; distance: number; angle: number; hash: number };
const TAU = Math.PI * 2;
const DURATION = 24;
const ORBIT_SCALE = 1.70;
const ORBIT_CENTER_Y = 0.60;

export function createBackground(host: HTMLElement) {
  const canvas = document.createElement('canvas');
  canvas.className = 'opsu-halftone-background';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:0';
  host.appendChild(canvas);
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas 2D unavailable');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0;
  let height = 0;
  let dots: Dot[] = [];
  let frame = 0;
  let elapsed = 6;
  let playing = true;
  let previousFrame = 0;
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0, inside: false, opacity: 0 };
  let ripples: HoverRippleSpawn[] = [];
  const rippleBake: HoverRippleBake = { maxR: 0, perPeak: 0, prepared: [], secondaryPeak: 0, sigPx: 0 };
  const started = performance.now();

  function resize() {
    width = host.clientWidth;
    height = host.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scale = Math.min(width, height) * ORBIT_SCALE;
    const spacing = width < 900 ? 6 : 8.5;
    dots = [];
    for (let row = 0; row * spacing < height; row++) {
      for (let column = 0; column * spacing < width; column++) {
        const x = column * spacing + (row % 2) * spacing * 0.5;
        const y = row * spacing;
        const dx = (x - width / 2) / scale;
        const dy = (y - height * ORBIT_CENTER_Y) / scale;
        const distance = Math.hypot(dx, dy);
        dots.push({ x, y, dx, dy, distance, angle: Math.atan2(dy, dx), hash: dotHash(column, row) });
      }
    }
    drawAt(elapsed);
  }

  function drawAt(seconds: number) {
    elapsed = seconds;
    const phase = ((seconds % DURATION) / DURATION) * TAU;
    const sine = Math.sin(phase);
    const cosine = Math.cos(phase);
    const light = document.documentElement.dataset.theme === 'light';
    context.fillStyle = light ? '#f5f5f6' : '#101113';
    context.fillRect(0, 0, width, height);
    const scale = Math.min(width, height) * ORBIT_SCALE;
    const glow = context.createRadialGradient(width / 2, height * ORBIT_CENTER_Y, 0, width / 2, height * ORBIT_CENTER_Y, scale * 0.64);
    glow.addColorStop(0, light ? '#85899116' : '#5b5d6218');
    glow.addColorStop(1, light ? '#85899100' : '#5b5d6200');
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
    const buckets: Dot[][] = Array.from({ length: 24 }, () => []);
    const innerRadius = 0.30 + sine * 0.009;
    const outerRadius = 0.44 + cosine * 0.008;
    const now = performance.now() / 1000;
    ripples = ripples.filter(ripple => now - ripple.born < 2.2);
    pointer.opacity += ((pointer.inside && !motion.matches ? 1 : 0) - pointer.opacity) * 0.18;
    pointer.x += (pointer.targetX - pointer.x) * 0.18;
    pointer.y += (pointer.targetY - pointer.y) * 0.18;
    prepareHoverRipples(ripples, {
      expandNormPerSec: 90 / width, fadePerSec: 2.1, lagSec: 0.09,
      lH: height, lW: width, peak: motion.matches ? 0 : 0.78,
      secondaryPeak: 0.36, sigmaNorm: 12 / width, wallNow: now,
    }, rippleBake);
    const followRadius = Math.min(110, Math.min(width, height) * 0.14);
    if (pointer.opacity > 0.002) {
      const followGlow = context.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, followRadius * 1.8);
      followGlow.addColorStop(0, light ? `rgba(76,80,88,${pointer.opacity * 0.055})` : `rgba(176,180,188,${pointer.opacity * 0.05})`);
      followGlow.addColorStop(1, 'rgba(176,180,188,0)');
      context.fillStyle = followGlow;
      context.fillRect(0, 0, width, height);
    }

    function sample(dot: Dot) {
      const { dx, dy, distance, angle } = dot;
      const rx = dx * cosine - dy * sine;
      const ry = dx * sine + dy * cosine;
      const opening = smoothstep(0.12, 0.35, Math.abs(angle + Math.PI / 4));
      let ring = 0;
      if (distance > innerRadius - 0.047 && distance < innerRadius) {
        ring = computeRing1Amp(distance, rx, ry, innerRadius, 0.047, 0) * opening;
      }
      if (distance > outerRadius - 0.018 && distance < outerRadius) {
        ring = Math.max(ring, computeRing2Amp(distance, rx, ry, outerRadius, 0.018, 0) * 0.65);
      }
      const mist = Math.exp(-Math.pow((distance - 0.31) / 0.105, 2));
      const texture = noiseVal(dx * 5 + cosine * 0.12, dy * 5 + sine * 0.12, 0) * 0.5 + 0.5;
      return ring * 0.72 + mist * texture * 0.20;
    }
    for (const dot of dots) {
      const distanceToPointer = Math.hypot(dot.x - pointer.x, dot.y - pointer.y);
      const follow = Math.exp(-distanceToPointer * distanceToPointer / (2 * followRadius * followRadius)) * pointer.opacity * 0.32;
      const interaction = follow + sampleHoverRippleAmp(dot.x, dot.y, rippleBake);
      const amplitude = Math.min(0.95, Math.max(0, sample(dot)) + interaction);
      if (amplitude < 0.02 || dot.hash > 0.97) continue;
      buckets[Math.min(23, Math.floor(amplitude * 24))].push(dot);
    }
    for (let index = 0; index < buckets.length; index++) {
      const amplitude = (index + 0.5) / 24;
      context.fillStyle = light ? `rgba(86,91,100,${0.06 + amplitude * 0.32})` : `rgba(142,147,156,${0.06 + amplitude * 0.50})`;
      context.beginPath();
      for (const dot of buckets[index]) {
        const radius = (0.32 + amplitude * 2.6) * (0.8 + dot.hash * 0.3);
        context.moveTo(dot.x + radius, dot.y);
        context.arc(dot.x, dot.y, radius, 0, TAU);
      }
      context.fill();
    }
  }

  function tick(now: number) {
    if (!playing || motion.matches || document.hidden) return;
    if (now - previousFrame >= 1000 / 30) {
      drawAt((now - started) / 1000);
      previousFrame = now;
    }
    frame = requestAnimationFrame(tick);
  }
  function refresh() {
    cancelAnimationFrame(frame);
    drawAt(motion.matches ? 6 : elapsed);
    if (playing && !motion.matches && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function onPointerMove(event: PointerEvent) {
    if (motion.matches) return;
    const bounds = host.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const inside = x >= 0 && y >= 0 && x <= width && y <= height;
    if (!pointer.inside && inside) { pointer.x = x; pointer.y = y; }
    pointer.inside = inside;
    pointer.targetX = x;
    pointer.targetY = y;
    if (!inside) return;
    const now = performance.now() / 1000;
    const last = ripples.at(-1);
    if (!last || (now - last.born >= 0.08 && Math.hypot(x - last.x, y - last.y) >= 24)) {
      ripples.push({ x, y, born: now });
      if (ripples.length > 6) ripples.shift();
    }
  }
  function onPointerLeave() { pointer.inside = false; }
  const resizeObserver = new ResizeObserver(resize);
  const themeObserver = new MutationObserver(refresh);
  resizeObserver.observe(host);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  motion.addEventListener('change', refresh);
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('blur', onPointerLeave);
  resize();
  refresh();
  return {
    canvas,
    duration: DURATION,
    drawAt,
    pause() { playing = false; cancelAnimationFrame(frame); },
    play() { playing = true; refresh(); },
    destroy() {
      playing = false;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      motion.removeEventListener('change', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('blur', onPointerLeave);
      canvas.remove();
    },
  };
}

