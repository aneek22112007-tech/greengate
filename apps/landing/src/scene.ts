import * as THREE from 'three';
import { LAND_BITS, LAND_H, LAND_W } from './landmask';
import { LEVEL_COLORS, ZONES, type Level } from './zones';

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  reducedMotion: boolean;
  mobile: boolean;
}

export interface Pose {
  x: number;
  y: number;
  scale: number;
  spin: number;
}

export interface GlobeScene {
  setLevel(level: Level): void;
  setFocus(index: number): void;
  setPose(pose: Partial<Pose>): void;
  pose: Pose;
  dispose(): void;
}

const landBytes = Uint8Array.from(atob(LAND_BITS), (c) => c.charCodeAt(0));
function isLand(lat: number, lon: number): boolean {
  const x = Math.min(LAND_W - 1, Math.max(0, Math.floor(((lon + 180) / 360) * LAND_W)));
  const y = Math.min(LAND_H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * LAND_H)));
  const i = y * LAND_W + x;
  return (landBytes[i >> 3] & (1 << (i & 7))) !== 0;
}

function latLonToVec(lat: number, lon: number, r = 1): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,255,255,0.6)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createGlobeScene({ canvas, reducedMotion, mobile }: SceneOptions): GlobeScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: true, powerPreference: 'high-performance' });
  const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 5.2);

  const levelColor = new THREE.Color(LEVEL_COLORS.moderate);
  const targetLevelColor = levelColor.clone();
  const uniforms = {
    uTime: { value: 0 },
    uLevel: { value: levelColor },
    uPixelRatio: { value: dpr },
  };

  const root = new THREE.Group();
  scene.add(root);
  const tilt = new THREE.Group();
  tilt.rotation.z = THREE.MathUtils.degToRad(-14);
  tilt.rotation.x = THREE.MathUtils.degToRad(12);
  root.add(tilt);
  const world = new THREE.Group();
  tilt.add(world);

  /* ---- dotted globe ---- */
  const N = mobile ? 9000 : 16000;
  const pos: number[] = [];
  const land: number[] = [];
  const seed: number[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i;
    const v = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
    const lat = THREE.MathUtils.radToDeg(Math.asin(v.y));
    const lon = THREE.MathUtils.radToDeg(Math.atan2(v.z, -v.x)) - 180;
    const l = isLand(lat, lon < -180 ? lon + 360 : lon);
    if (!l && i % 4 !== 0) continue;
    pos.push(v.x, v.y, v.z);
    land.push(l ? 1 : 0);
    seed.push(Math.random());
  }
  const dotsGeo = new THREE.BufferGeometry();
  dotsGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  dotsGeo.setAttribute('aLand', new THREE.Float32BufferAttribute(land, 1));
  dotsGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  const dotsMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aLand; attribute float aSeed;
      uniform float uTime; uniform float uPixelRatio;
      varying float vLand; varying float vFacing; varying float vTw;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * position);
        vFacing = dot(n, normalize(-mv.xyz));
        vLand = aLand;
        vTw = 0.65 + 0.35 * sin(uTime * 1.6 + aSeed * 40.0);
        gl_PointSize = (aLand > 0.5 ? 4.4 : 2.2) * uPixelRatio * (3.2 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLevel;
      varying float vLand; varying float vFacing; varying float vTw;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.1, d);
        float face = smoothstep(-0.15, 0.6, vFacing);
        vec3 landCol = mix(vec3(0.37, 0.92, 0.71), uLevel, 0.35);
        vec3 col = mix(vec3(0.12, 0.42, 0.36), landCol, vLand);
        float alpha = a * face * mix(0.22, 1.0 * vTw, vLand);
        gl_FragColor = vec4(col, alpha);
      }`,
  });
  world.add(new THREE.Points(dotsGeo, dotsMat));

  /* ---- occluder core with inner rim ---- */
  const coreMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLevel; varying vec3 vN; varying vec3 vV;
      void main() {
        float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.6);
        vec3 base = vec3(0.012, 0.035, 0.03);
        vec3 col = base + mix(vec3(0.2, 0.75, 0.6), uLevel, 0.5) * f * 0.38;
        gl_FragColor = vec4(col, 0.94);
      }`,
  });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.985, 64, 64), coreMat);
  core.renderOrder = -1;
  world.add(core);

  /* ---- atmosphere ---- */
  const atmoMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLevel; varying vec3 vN; varying vec3 vV;
      void main() {
        float f = pow(clamp(0.8 + dot(vN, vV), 0.0, 1.0), 3.2);
        vec3 col = mix(vec3(0.25, 0.95, 0.72), uLevel, 0.6);
        gl_FragColor = vec4(col, f * 0.55);
      }`,
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.16, 64, 64), atmoMat);
  tilt.add(atmo);

  /* ---- zone markers ---- */
  const glow = glowTexture();
  interface Marker { group: THREE.Group; ring: THREE.Mesh; ringMat: THREE.ShaderMaterial; glowMat: THREE.SpriteMaterial; beamMat: THREE.MeshBasicMaterial; base: number }
  const markers: Marker[] = [];
  const ringGeo = new THREE.RingGeometry(0.035, 0.05, 48);
  const beamGeo = new THREE.CylinderGeometry(0.004, 0.004, 1, 6, 1, true);
  beamGeo.translate(0, 0.5, 0);
  ZONES.forEach((z, i) => {
    const color = new THREE.Color(LEVEL_COLORS[z.level]);
    const g = new THREE.Group();
    const p = latLonToVec(z.lat, z.lon, 1.0);
    g.position.copy(p);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().normalize());
    const glowMat = new THREE.SpriteMaterial({ map: glow, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const sprite = new THREE.Sprite(glowMat);
    sprite.scale.setScalar(0.16);
    sprite.position.y = 0.01;
    g.add(sprite);
    const ringMat = new THREE.ShaderMaterial({
      uniforms: { uTime: uniforms.uTime, uColor: { value: color }, uOffset: { value: i * 0.37 }, uBoost: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uOffset; uniform float uBoost; varying float vA;
        void main() {
          float t = fract(uTime * 0.45 + uOffset);
          vA = 1.0 - t;
          vec3 p = position * (1.0 + t * (1.8 + uBoost * 1.6));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uBoost; varying float vA;
        void main() { gl_FragColor = vec4(uColor, vA * (0.75 + uBoost * 0.25)); }`,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.004;
    g.add(ring);
    const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    const base = 0.08 + (z.level === 'high' ? 0.14 : z.level === 'moderate' ? 0.09 : 0.05);
    beam.scale.y = base;
    g.add(beam);
    world.add(g);
    markers.push({ group: g, ring, ringMat, glowMat, beamMat, base });
    (g.userData as { beam: THREE.Mesh }).beam = beam;
  });

  /* ---- request arcs ---- */
  const arcPairs: [number, number][] = [[0, 9], [1, 3], [4, 6], [2, 0], [7, 1], [8, 11], [5, 4], [10, 0], [11, 9], [3, 4]];
  const arcMats: THREE.ShaderMaterial[] = [];
  arcPairs.forEach(([a, b], i) => {
    const A = latLonToVec(ZONES[a].lat, ZONES[a].lon, 1.0);
    const B = latLonToVec(ZONES[b].lat, ZONES[b].lon, 1.0);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const lift = 1 + A.distanceTo(B) * 0.45;
    mid.normalize().multiplyScalar(lift);
    const curve = new THREE.QuadraticBezierCurve3(A, mid, B);
    const pts = curve.getPoints(80);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    geo.setAttribute('aT', new THREE.Float32BufferAttribute(pts.map((_, k) => k / (pts.length - 1)), 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: uniforms.uTime, uLevel: uniforms.uLevel, uOffset: { value: i * 0.29 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `attribute float aT; varying float vT; void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);}`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uOffset; uniform vec3 uLevel; varying float vT;
        void main() {
          float head = fract(uTime * 0.28 + uOffset) * 1.6 - 0.3;
          float d = vT - head;
          float pulse = smoothstep(-0.28, 0.0, d) * (1.0 - smoothstep(0.0, 0.02, d));
          vec3 col = mix(vec3(0.5, 1.0, 0.82), uLevel, 0.45);
          gl_FragColor = vec4(col, 0.08 + pulse * 0.95);
        }`,
    });
    arcMats.push(mat);
    world.add(new THREE.Line(geo, mat));
  });

  /* ---- orbit rings with satellites ---- */
  const orbits = new THREE.Group();
  tilt.add(orbits);
  const ringLineMat = new THREE.LineBasicMaterial({ color: 0x5eeab4, transparent: true, opacity: 0.16 });
  const sats: { mesh: THREE.Sprite; r: number; speed: number; phase: number; ring: THREE.Object3D }[] = [];
  [[1.5, 72, 0.18], [1.78, 64, -0.12]].forEach(([r, incl, speed], idx) => {
    const ring = new THREE.Group();
    ring.rotation.x = THREE.MathUtils.degToRad(incl);
    ring.rotation.y = idx * 0.9;
    const pts = new THREE.EllipseCurve(0, 0, r, r).getPoints(160).map((p) => new THREE.Vector3(p.x, p.y, 0));
    ring.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), ringLineMat));
    orbits.add(ring);
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: k === 1 ? 0xffc24b : k === 2 ? 0xff5d6c : 0x4ef0a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.scale.setScalar(0.12);
      ring.add(m);
      sats.push({ mesh: m, r, speed, phase: (k / 3) * Math.PI * 2, ring });
    }
  });

  /* ---- stars ---- */
  const starCount = mobile ? 500 : 1100;
  const sp = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(8 + Math.random() * 14);
    sp.set([v.x, v.y, v.z - 6], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x9fe9cf, size: 0.035, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false }));
  scene.add(stars);

  /* ---- state ---- */
  const pose: Pose = { x: 0, y: 0, scale: 1, spin: 0 };
  let focus = -1;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onPointer = (e: PointerEvent) => {
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  };
  if (!reducedMotion) window.addEventListener('pointermove', onPointer, { passive: true });

  // Start with India facing the viewer.
  const facing = latLonToVec(ZONES[0].lat, ZONES[0].lon);
  world.rotation.y = -Math.atan2(facing.x, facing.z) - 0.5;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  let last = performance.now();
  let raf = 0;
  let running = true;
  let needsRender = true;

  function frame() {
    raf = requestAnimationFrame(frame);
    if (!running) return;
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const animate = !reducedMotion;
    if (!animate && !needsRender) return;
    needsRender = false;
    if (animate) uniforms.uTime.value += dt;

    levelColor.lerp(targetLevelColor, animate ? 0.06 : 1);
    if (animate) {
      pointer.x += (pointer.tx - pointer.x) * 0.05;
      pointer.y += (pointer.ty - pointer.y) * 0.05;
      world.rotation.y += dt * 0.06;
      orbits.rotation.y -= dt * 0.03;
      stars.rotation.y += dt * 0.004;
    }
    root.rotation.y = pose.spin + pointer.x * 0.25;
    root.rotation.x = pointer.y * 0.15;
    const aspect = camera.aspect;
    const xScale = Math.min(1, aspect / 1.6);
    root.position.set(pose.x * 1.6 * xScale, pose.y, 0);
    root.scale.setScalar(pose.scale);

    const t = uniforms.uTime.value;
    for (const s of sats) {
      const a = s.phase + t * s.speed * 3;
      s.mesh.position.set(Math.cos(a) * s.r, Math.sin(a) * s.r, 0);
    }
    markers.forEach((m, i) => {
      const target = i === focus ? 1 : 0;
      const u = m.ringMat.uniforms.uBoost;
      u.value += (target - u.value) * 0.08;
      const beam = (m.group.userData as { beam: THREE.Mesh }).beam;
      beam.scale.y = m.base * (1 + u.value * 1.4);
      m.beamMat.opacity = 0.45 + u.value * 0.5;
      m.group.children[0].scale.setScalar(0.16 + u.value * 0.14);
    });
    renderer.render(scene, camera);
  }
  frame();

  const onVis = () => {
    running = !document.hidden;
    last = performance.now();
  };
  document.addEventListener('visibilitychange', onVis);

  return {
    pose,
    setLevel(level) {
      targetLevelColor.set(LEVEL_COLORS[level]);
      needsRender = true;
    },
    setFocus(index) {
      focus = index;
      needsRender = true;
    },
    setPose(p) {
      Object.assign(pose, p);
      needsRender = true;
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVis);
      renderer.dispose();
    },
  };
}
