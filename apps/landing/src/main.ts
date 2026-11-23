import './style.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { HUD_SEQUENCE, PRESETS, ZONES, type Level, type Variant } from './zones';
import type { GlobeScene, Pose } from './scene';

gsap.registerPlugin(ScrollTrigger);
document.documentElement.classList.add('js');

const DEMO_URL = (import.meta.env.VITE_DEMO_URL as string | undefined) || 'https://greengate-demo.vercel.app';
const REPO_URL = 'https://github.com/aneek22112007-tech/greengate';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll(sel)) as T[];

/* ---------- links ---------- */
for (const a of $$<HTMLAnchorElement>('[data-demo]')) {
  a.href = DEMO_URL;
  a.target = '_blank';
  a.rel = 'noopener';
}
for (const a of $$<HTMLAnchorElement>('[data-repo]')) a.href = REPO_URL;

/* ---------- smooth scroll ---------- */
let lenis: Lenis | null = null;
if (!reducedMotion) {
  lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}
for (const a of $$<HTMLAnchorElement>('a[href^="#"]')) {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href')!;
    if (id.length < 2) return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target as HTMLElement, { offset: -20 });
    else target.scrollIntoView();
    (target as HTMLElement).setAttribute('tabindex', '-1');
    (target as HTMLElement).focus({ preventScroll: true });
  });
}

/* ---------- nav ---------- */
const nav = $('#nav');
ScrollTrigger.create({ start: 40, onUpdate: (self) => nav.classList.toggle('scrolled', self.scroll() > 40) });
for (const link of $$<HTMLAnchorElement>('.nav nav a')) {
  const section = document.querySelector(link.getAttribute('href')!);
  if (!section) continue;
  ScrollTrigger.create({
    trigger: section,
    start: 'top 50%',
    end: 'bottom 50%',
    onToggle: (self) => link.classList.toggle('active', self.isActive),
  });
}

/* ---------- reveals ---------- */
if (!reducedMotion) {
  ScrollTrigger.batch('.reveal', {
    start: 'top 88%',
    once: true,
    onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', stagger: 0.08 }),
  });
} else {
  $$('.reveal').forEach((el) => {
    el.style.opacity = '1';
    el.style.transform = 'none';
  });
}

/* ---------- counters ---------- */
for (const el of $$('[data-count]')) {
  const end = Number(el.dataset.count);
  if (reducedMotion) {
    el.textContent = String(end);
    continue;
  }
  const obj = { v: 0 };
  ScrollTrigger.create({
    trigger: el,
    start: 'top 90%',
    once: true,
    onEnter: () =>
      gsap.to(obj, {
        v: end,
        duration: 1.8,
        ease: 'power3.out',
        onUpdate: () => {
          el.textContent = String(Math.round(obj.v));
        },
      }),
  });
}

/* ---------- tilt cards ---------- */
if (!reducedMotion && !mobile) {
  for (const card of $$('.tilt')) {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(800px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateZ(0)`;
    });
    card.addEventListener('pointerleave', () => {
      card.style.transform = '';
    });
  }
}

/* ---------- 3D scene (lazy) ---------- */
let globe: GlobeScene | null = null;
let mode: 'hero' | 'play' = 'hero';
let heroLevel: Level = 'moderate';
let playLevel: Level = 'moderate';

function applyLevel(level: Level) {
  document.body.dataset.level = level;
  globe?.setLevel(level);
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const poses: Record<string, (m: boolean) => Pose> = {
  hero: (m) => (m ? { x: 0, y: 1.05, scale: 0.66, spin: 0 } : { x: 0.86, y: 0.04, scale: 0.92, spin: 0 }),
  problem: (m) => (m ? { x: 0, y: 1.2, scale: 0.7, spin: 0.8 } : { x: -1.05, y: -0.1, scale: 0.78, spin: 0.8 }),
  playground: (m) => (m ? { x: 0, y: -0.4, scale: 0.9, spin: 1.6 } : { x: 0, y: -0.3, scale: 1.3, spin: 1.6 }),
  how: (m) => (m ? { x: 0, y: 1.3, scale: 0.6, spin: 2.4 } : { x: 0.95, y: 0.55, scale: 0.62, spin: 2.4 }),
  experiment: (m) => (m ? { x: 0, y: 1.2, scale: 0.6, spin: 3.2 } : { x: 1.05, y: -0.45, scale: 0.7, spin: 3.2 }),
  plugin: (m) => (m ? { x: 0, y: 1.2, scale: 0.6, spin: 4.0 } : { x: 1.0, y: -0.35, scale: 0.75, spin: 4.0 }),
  cta: (m) => (m ? { x: 0, y: 0, scale: 1.1, spin: 4.8 } : { x: 0, y: -0.05, scale: 1.25, spin: 4.8 }),
};

function goTo(sceneName: string) {
  if (sceneName === 'playground') {
    mode = 'play';
    applyLevel(playLevel);
  } else if (mode === 'play') {
    mode = 'hero';
    applyLevel(heroLevel);
  }
  if (!globe) return;
  const target = poses[sceneName]?.(mobile);
  if (!target) return;
  const g = globe;
  gsap.to(g.pose, {
    ...target,
    duration: reducedMotion ? 0 : 1.6,
    ease: 'expo.inOut',
    overwrite: true,
    onUpdate: () => g.setPose({}),
  });
}

for (const section of $$('[data-scene]')) {
  ScrollTrigger.create({
    trigger: section,
    start: 'top 55%',
    end: 'bottom 55%',
    onEnter: () => goTo(section.dataset.scene!),
    onEnterBack: () => goTo(section.dataset.scene!),
  });
}

async function bootScene() {
  if (!webglAvailable()) return;
  const canvas = $<HTMLCanvasElement>('#gl');
  try {
    const { createGlobeScene } = await import('./scene');
    globe = createGlobeScene({ canvas, reducedMotion, mobile });
    const current = $$('[data-scene]').find((s) => {
      const r = s.getBoundingClientRect();
      return r.top < window.innerHeight * 0.55 && r.bottom > window.innerHeight * 0.55;
    });
    const name = current?.dataset.scene || 'hero';
    globe.setPose(poses[name](mobile));
    globe.setLevel((document.body.dataset.level as Level) || 'moderate');
    requestAnimationFrame(() => canvas.classList.add('ready'));
  } catch (error) {
    console.warn('3D scene unavailable, using the static background.', error);
  }
}
const idle = (cb: () => void) => ('requestIdleCallback' in window ? (window as Window & { requestIdleCallback: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback(cb, { timeout: 1200 }) : setTimeout(cb, 300));
if (document.readyState === 'complete') idle(bootScene);
else window.addEventListener('load', () => idle(bootScene), { once: true });

/* ---------- HUD cycle ---------- */
const hudZone = $('#hud-zone');
const hudLevel = $('#hud-level');
const hudVariant = $('#hud-variant');
const hudUid = $('#hud-uid');
const hudBar = $('#hud-bar');
let hudStep = 0;
function hudTick() {
  const zi = HUD_SEQUENCE[hudStep % HUD_SEQUENCE.length];
  const z = ZONES[zi];
  const variant = PRESETS.strict[z.level];
  hudZone.textContent = z.id;
  hudLevel.textContent = z.level;
  hudLevel.dataset.v = z.level;
  hudVariant.textContent = variant;
  hudVariant.dataset.v = variant;
  hudUid.textContent = `"user-${(42 + hudStep * 17) % 1000}"`;
  heroLevel = z.level;
  if (mode === 'hero') applyLevel(z.level);
  globe?.setFocus(zi);
  if (!reducedMotion) gsap.fromTo(hudBar, { width: '0%' }, { width: '100%', duration: 3.2, ease: 'none' });
  hudStep++;
}
hudTick();
if (!reducedMotion) setInterval(hudTick, 3200);

/* ---------- playground ---------- */
const WH: Record<Variant, number> = { full: 0.3 + 0.2, eco: 0.05, off: 0 };
const READER: Record<Variant, { chip: string; body: string; cap: string }> = {
  full: {
    chip: 'Live summary',
    body: 'A fresh summary is generated for this reader on this request, next to the animated hero.',
    cap: 'Animated stand-in. Autoplay is on in full.',
  },
  eco: {
    chip: 'Cached summary',
    body: 'A cached summary, generated once and reused. No new model call on this request.',
    cap: 'Still image. Autoplay is off in eco.',
  },
  off: {
    chip: 'Paused',
    body: 'Paused because the grid is dirty right now.',
    cap: 'Still image. Nothing heavy runs in off.',
  },
};
const sw = $('#switch3d');
const reader = $('#reader');
const variantOut = $('#variant-out');
function updatePlayground() {
  const level = ($<HTMLInputElement>('input[name="level"]:checked')?.value || 'moderate') as Level;
  const preset = ($<HTMLInputElement>('input[name="preset"]:checked')?.value || 'strict') as 'strict' | 'gentle';
  const variant = PRESETS[preset][level];
  playLevel = level;
  if (mode === 'play') applyLevel(level);
  sw.dataset.variant = variant;
  reader.dataset.variant = variant;
  variantOut.textContent = variant;
  variantOut.dataset.v = variant;
  const r = READER[variant];
  $('#rs-chip').textContent = r.chip;
  $('#rs-body').textContent = r.body;
  $('#rh-cap').textContent = r.cap;
  const used = WH[variant];
  $('#m-wh').textContent = `${used.toFixed(2)} Wh`;
  $('#m-saved').textContent = `${Math.round((1 - used / WH.full) * 100)}%`;
  $('#m-fill').style.width = `${Math.max(2, (used / WH.full) * 100)}%`;
}
for (const input of $$<HTMLInputElement>('.seg input')) input.addEventListener('change', updatePlayground);
updatePlayground();

/* ---------- flow line ---------- */
const flowPath = $<SVGPathElement>('#flow-path');
if (flowPath && !reducedMotion) {
  gsap.to(flowPath, { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: '#flow', start: 'top 80%', end: 'bottom 50%', scrub: true } });
} else if (flowPath) {
  flowPath.style.strokeDashoffset = '0';
}

/* ---------- experiment ---------- */
ScrollTrigger.create({ trigger: '.exp', start: 'top 75%', once: true, onEnter: () => $('.exp').classList.add('in') });

/* ---------- code tabs ---------- */
const tabs = $$<HTMLButtonElement>('[role="tab"]');
function selectTab(tab: HTMLButtonElement) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    const panel = document.getElementById(t.getAttribute('aria-controls')!);
    if (panel) panel.hidden = !on;
  }
}
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    selectTab(next);
    next.focus();
  });
});
const copyBtn = $<HTMLButtonElement>('#copy-btn');
copyBtn.addEventListener('click', async () => {
  const panel = $$('[role="tabpanel"]').find((p) => !p.hidden);
  if (!panel) return;
  try {
    await navigator.clipboard.writeText(panel.textContent || '');
    copyBtn.textContent = 'Copied';
    copyBtn.classList.add('ok');
  } catch {
    copyBtn.textContent = 'Press Ctrl+C';
  }
  setTimeout(() => {
    copyBtn.textContent = 'Copy';
    copyBtn.classList.remove('ok');
  }, 1600);
});
