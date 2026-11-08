import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GPUComputationRenderer, type Variable } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import './style.css';
import type { ShapeName, StarsAPI, ShapeData } from './api';
import { buildShape, textToShape, randomCloud, SHAPE_ORDER, type BuiltinShape } from './shapes';
import { initUI } from './ui';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches;
const forcedN = parseInt(params.get('n') || '', 10);
let TEX = forcedN === 512 || forcedN === 256 || forcedN === 1024 ? forcedN : isTouch ? 512 : 1024;

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
renderer.setClearColor(0x000000, 1);
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 2 : 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
camera.position.set(0, 64, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 18;
controls.maxDistance = 220;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;
controls.rotateSpeed = 0.6;

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
vec3 flow(vec3 p){ return vec3(snoise(p), snoise(p+vec3(31.416,0.0,0.0)), snoise(p+vec3(0.0,0.0,47.3))); }
float hash21(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
`;

const velocityShader = /* glsl */ `
${NOISE}
uniform sampler2D uTargetA; uniform sampler2D uTargetB;
uniform float uProgress; uniform float uTime; uniform float uDt;
uniform vec3 uMouse; uniform float uHover; uniform float uCollapse; uniform float uBurst;
uniform float uStiffness; uniform float uDamping; uniform float uNoiseAmp;
void main(){
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec3 pos = texture2D(texturePosition, uv).xyz;
  vec3 vel = texture2D(textureVelocity, uv).xyz;
  float h = hash21(uv);
  float delay = h * 0.6;
  float p = smoothstep(delay, delay + 0.4, uProgress);
  vec3 target = mix(texture2D(uTargetA, uv).xyz, texture2D(uTargetB, uv).xyz, p);
  // spring toward target
  vel += (target - pos) * uStiffness * uDt;
  // living drift
  vel += flow(pos * 0.07 + vec3(0.0, uTime * 0.04, uTime * 0.03)) * uNoiseAmp * uDt;
  // hover: carve a soft hole
  if (uHover > 0.0) {
    vec3 d = pos - uMouse; float r2 = dot(d, d);
    float f = exp(-r2 / 26.0);
    vel += normalize(d + 1e-4) * f * 90.0 * uHover * uDt;
  }
  // collapse: black hole with swirl
  if (uCollapse > 0.0) {
    vec3 d = uMouse - pos; float r = max(length(d), 0.4); vec3 dir = d / r;
    vec3 tang = normalize(cross(dir, vec3(0.0, 0.0, 1.0)) + vec3(1e-4));
    float g = 1.0 / (r * 0.25 + 0.15);
    vel += (dir * 300.0 * g + tang * 150.0 * g) * uCollapse * uDt;
    vel *= 1.0 - 0.6 * uDt * uCollapse; // extra drag so they orbit instead of escaping
  }
  // burst: one-frame outward impulse
  if (uBurst > 0.0) {
    vec3 d = pos - uMouse; float r = max(length(d), 0.3);
    vec3 rnd = flow(pos * 0.35 + 7.0);
    vel += (d / r * (1.0 + 0.6 * h) + rnd * 0.6) * uBurst * 46.0 / (1.0 + r * 0.08);
  }
  vel *= exp(-uDamping * uDt);
  gl_FragColor = vec4(vel, 1.0);
}`;

const positionShader = /* glsl */ `
uniform float uDt;
void main(){
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec3 pos = texture2D(texturePosition, uv).xyz;
  vec3 vel = texture2D(textureVelocity, uv).xyz;
  pos += vel * uDt;
  gl_FragColor = vec4(pos, 1.0);
}`;

const pointVert = /* glsl */ `
attribute vec2 ref;
uniform sampler2D uPos; uniform sampler2D uVel; uniform sampler2D uColA; uniform sampler2D uColB;
uniform float uProgress; uniform float uSize; uniform float uPixelRatio; uniform float uHeight;
varying vec3 vColor; varying float vFade;
float hash21(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
void main(){
  vec3 pos = texture2D(uPos, ref).xyz;
  vec3 vel = texture2D(uVel, ref).xyz;
  float h = hash21(ref);
  float delay = h * 0.6;
  float p = smoothstep(delay, delay + 0.4, uProgress);
  vec3 col = mix(texture2D(uColA, ref).rgb, texture2D(uColB, ref).rgb, p);
  float speed = length(vel);
  col = mix(col, vec3(1.0, 0.88, 0.7), clamp((speed - 6.0) * 0.03, 0.0, 0.85));
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  float dist = -mv.z;
  gl_PointSize = max(uSize * uPixelRatio * (0.7 + h * 0.9) * (uHeight / 900.0) * (60.0 / dist), 1.0);
  gl_Position = projectionMatrix * mv;
  vColor = col;
  vFade = clamp(1.0 - dist / 600.0, 0.2, 1.0);
}`;

const pointFrag = /* glsl */ `
uniform float uIntensity;
varying vec3 vColor; varying float vFade;
void main(){
  vec2 c = gl_PointCoord - 0.5; float d2 = dot(c, c);
  if (d2 > 0.25) discard;
  float a = exp(-d2 * 14.0);
  gl_FragColor = vec4(vColor * a * uIntensity * vFade, a);
}`;

const finalShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
  uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; varying vec2 vUv;
  void main(){
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    vec2 q = vUv - 0.5;
    c *= clamp(1.08 - dot(q, q) * 1.1, 0.0, 1.0);
    float g = fract(sin(dot(vUv * uRes + fract(uTime) * 100.0, vec2(12.9898, 78.233))) * 43758.5453);
    c += (g - 0.5) * 0.025;
    gl_FragColor = vec4(c, 1.0);
  }`,
};

// ---------------------------------------------------------------------------
// Particle system
// ---------------------------------------------------------------------------
interface System {
  size: number; count: number;
  gpu: GPUComputationRenderer; posVar: Variable; velVar: Variable;
  targetA: THREE.DataTexture; targetB: THREE.DataTexture; colA: THREE.DataTexture; colB: THREE.DataTexture;
  points: THREE.Points; material: THREE.ShaderMaterial; baseIntensity: number;
  dispose(): void;
}

function makeDataTexture(size: number, data?: Float32Array) {
  const t = new THREE.DataTexture(data ?? new Float32Array(size * size * 4), size, size, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

function createSystem(size: number, initial: ShapeData): System {
  const count = size * size;
  const gpu = new GPUComputationRenderer(size, size, renderer);
  if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 required');

  const pos0 = gpu.createTexture();
  (pos0.image.data as Float32Array).set(initial.positions);
  const vel0 = gpu.createTexture(); // zeros

  const posVar = gpu.addVariable('texturePosition', positionShader, pos0);
  const velVar = gpu.addVariable('textureVelocity', velocityShader, vel0);
  gpu.setVariableDependencies(posVar, [posVar, velVar]);
  gpu.setVariableDependencies(velVar, [posVar, velVar]);

  const targetA = makeDataTexture(size, initial.positions.slice());
  const targetB = makeDataTexture(size, initial.positions.slice());
  const colA = makeDataTexture(size, initial.colors.slice());
  const colB = makeDataTexture(size, initial.colors.slice());

  Object.assign(velVar.material.uniforms, {
    uTargetA: { value: targetA }, uTargetB: { value: targetB },
    uProgress: { value: 1 }, uTime: { value: 0 }, uDt: { value: 0.016 },
    uMouse: { value: new THREE.Vector3(0, 0, 0) }, uHover: { value: 0 }, uCollapse: { value: 0 }, uBurst: { value: 0 },
    uStiffness: { value: 10 }, uDamping: { value: 4.2 }, uNoiseAmp: { value: 6 },
  });
  Object.assign(posVar.material.uniforms, { uDt: { value: 0.016 } });

  const err = gpu.init();
  if (err) throw new Error(err);

  // geometry: one vertex per texel
  const geo = new THREE.BufferGeometry();
  const refs = new Float32Array(count * 2);
  const positions = new Float32Array(count * 3); // unused by the shader but required
  for (let i = 0; i < count; i++) {
    refs[i * 2] = ((i % size) + 0.5) / size;
    refs[i * 2 + 1] = (Math.floor(i / size) + 0.5) / size;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('ref', new THREE.BufferAttribute(refs, 2));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000);

  const scale = 1024 / size; // fewer particles => bigger, brighter
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPos: { value: null }, uVel: { value: null }, uColA: { value: colA }, uColB: { value: colB },
      uProgress: { value: 1 }, uSize: { value: 1.15 * Math.sqrt(scale) }, uPixelRatio: { value: renderer.getPixelRatio() },
      uHeight: { value: innerHeight }, uIntensity: { value: 0.14 * scale },
    },
    vertexShader: pointVert, fragmentShader: pointFrag,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  scene.add(points);

  return {
    size, count, gpu, posVar, velVar, targetA, targetB, colA, colB, points, material, baseIntensity: 0.14 * scale,
    dispose() {
      scene.remove(points); geo.dispose(); material.dispose();
      targetA.dispose(); targetB.dispose(); colA.dispose(); colB.dispose();
      gpu.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Post-processing
// ---------------------------------------------------------------------------
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.5, 0.35);
composer.addPass(bloom);
const finalPass = new ShaderPass(finalShader);
composer.addPass(finalPass);
composer.addPass(new OutputPass());

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.resolution.set(w / 2, h / 2);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  finalPass.uniforms.uRes.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
  if (sys) { sys.material.uniforms.uHeight.value = h; sys.material.uniforms.uPixelRatio.value = renderer.getPixelRatio(); }
}
addEventListener('resize', resize);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let sys: System | null = null;
let currentShape: ShapeName = 'galaxy';
let currentText = '';
let lastShape: BuiltinShape = 'galaxy';
let progress = 1;            // morph progress 0..1
let morphSpeed = 1 / 1.7;    // per second
let autoCycle = true;
let lastInteraction = 0;
let lastMorph = 0;
let springScale = 1;         // animated multiplier on stiffness
let springTarget = 1;
let collapse = 0;            // 0..1
let holding = false;
let burstPending = 0;
let hover = 0;
let faceFront = false; let faceFrontUntil = 0;
let intensityGoal = 1, intensityCur = 1;
const mouseWorld = new THREE.Vector3();
const mouseNdc = new THREE.Vector2(10, 10);
let mouseOnCanvas = false;
const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane();
const clock = new THREE.Clock();
let time = 0;

function emit(type: string, detail?: unknown) {
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

function setTargets(data: ShapeData) {
  if (!sys) return;
  // A := current B, B := new
  const { targetA, targetB, colA, colB } = sys;
  (targetA.image.data as Float32Array).set(targetB.image.data as Float32Array); targetA.needsUpdate = true;
  (colA.image.data as Float32Array).set(colB.image.data as Float32Array); colA.needsUpdate = true;
  (targetB.image.data as Float32Array).set(data.positions); targetB.needsUpdate = true;
  (colB.image.data as Float32Array).set(data.colors); colB.needsUpdate = true;
  progress = 0;
  lastMorph = time;
}

function showShape(name: BuiltinShape, fromUser = true) {
  if (!sys) return;
  currentShape = name; lastShape = name; currentText = '';
  faceFront = false; intensityGoal = 1;
  setTargets(buildShape(name, sys.count));
  if (fromUser) lastInteraction = time;
  emit('stars:morph', { shape: name, text: '' });
}

function showText(text: string) {
  if (!sys) return;
  const t = text.trim().slice(0, 60);
  if (!t) { showShape(lastShape); return; }
  currentShape = 'text'; currentText = t;
  faceFront = true; faceFrontUntil = time + 2.5; intensityGoal = 0.42;
  setTargets(textToShape(t, sys.count));
  lastInteraction = time;
  emit('stars:morph', { shape: 'text', text: t });
}

function nextShape() {
  const i = SHAPE_ORDER.indexOf(lastShape);
  showShape(SHAPE_ORDER[(i + 1) % SHAPE_ORDER.length]);
}

// ---------------------------------------------------------------------------
// Pointer interaction: hover repel, hold = black hole, release = burst, drag = orbit
// ---------------------------------------------------------------------------
let downPos: { x: number; y: number } | null = null;
let holdTimer = 0;
let dragging = false;

function updateMouseWorld(clientX: number, clientY: number) {
  mouseNdc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(mouseNdc, camera);
  const dir = camera.getWorldDirection(new THREE.Vector3());
  plane.setFromNormalAndCoplanarPoint(dir, new THREE.Vector3(0, 0, 0));
  const hit = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  if (hit) mouseWorld.copy(hit);
}

canvas.addEventListener('pointermove', (e) => {
  mouseOnCanvas = true;
  updateMouseWorld(e.clientX, e.clientY);
  if (downPos && !holding && !dragging) {
    const dx = e.clientX - downPos.x, dy = e.clientY - downPos.y;
    if (dx * dx + dy * dy > 64) { dragging = true; clearTimeout(holdTimer); lastInteraction = time; }
  }
  if (holding) lastInteraction = time;
});
canvas.addEventListener('pointerleave', () => { mouseOnCanvas = false; });
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  downPos = { x: e.clientX, y: e.clientY }; dragging = false;
  updateMouseWorld(e.clientX, e.clientY);
  clearTimeout(holdTimer);
  holdTimer = window.setTimeout(() => {
    if (dragging || !downPos) return;
    holding = true; controls.enabled = false; lastInteraction = time;
    springTarget = 0.08;
    emit('stars:collapse');
  }, 170);
});
function release() {
  clearTimeout(holdTimer);
  if (holding) {
    holding = false;
    burstPending = 1;
    springTarget = 1;
    setTimeout(() => { controls.enabled = true; }, 0);
    emit('stars:burst');
  }
  downPos = null; dragging = false;
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
controls.addEventListener('start', () => { lastInteraction = time; });

// ---------------------------------------------------------------------------
// Screenshot
// ---------------------------------------------------------------------------
let shotResolve: ((b: Blob) => void) | null = null;
function screenshot(): Promise<Blob> {
  return new Promise((resolve) => { shotResolve = resolve; });
}

// ---------------------------------------------------------------------------
// FPS + adaptive quality
// ---------------------------------------------------------------------------
let frames = 0, fpsAccum = 0, fps = 60, lowStreak = 0;
let startedAt = 0;

function rebuild(size: number) {
  if (!sys) return;
  const old = sys;
  const curB = (old.targetB.image.data as Float32Array);
  const curC = (old.colB.image.data as Float32Array);
  // down-sample current target into the new size by striding
  const n = size * size, stride = old.count / n;
  const positions = new Float32Array(n * 4), colors = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { const j = Math.floor(i * stride) * 4; positions.set(curB.subarray(j, j + 4), i * 4); colors.set(curC.subarray(j, j + 4), i * 4); }
  old.dispose();
  sys = createSystem(size, { positions, colors });
  TEX = size;
  progress = 1;
  resize();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function boot() {
  const count = TEX * TEX;
  sys = createSystem(TEX, randomCloud(count, 70));
  resize();

  const api: StarsAPI = {
    setText: showText,
    setShape: (name) => showShape(name),
    next: nextShape,
    getState: () => ({ text: currentText, shape: currentShape, count: sys?.count ?? 0 }),
    screenshot,
    setAutoCycle: (on) => { autoCycle = on; if (on) lastInteraction = time; },
  };
  window.stars = api;
  (window as any).__stars = { renderer, scene, camera, controls, bloom, get sys() { return sys; } };

  // intro: cloud -> hero shape (or ?t= text / ?s= shape)
  const t = params.get('t');
  const s = params.get('s') as BuiltinShape | null;
  setTimeout(() => {
    if (t && t.trim()) showText(t);
    else if (s && SHAPE_ORDER.includes(s)) showShape(s, false);
    else showShape('galaxy', false);
    lastInteraction = time + 4; // hold hero for a while before cycling
  }, 400);

  initUI();
  emit('stars:ready');
  startedAt = performance.now();
  renderer.setAnimationLoop(frame);
}

const camTarget = new THREE.Vector3(0, 0, 0);
function frame() {
  if (!sys) return;
  const dt = Math.min(clock.getDelta(), 1 / 30);
  time += dt;

  // intro dolly
  const since = (performance.now() - startedAt) / 1000;
  if (since < 5) {
    const k = 1 - Math.pow(1 - Math.min(since / 5, 1), 3);
    const d = THREE.MathUtils.lerp(119, 64, k);
    const dir = camera.position.clone().sub(camTarget).normalize();
    camera.position.copy(dir.multiplyScalar(d));
  }

  // morph progress
  if (progress < 1) progress = Math.min(1, progress + dt * morphSpeed);

  // spring scale easing (collapse / burst)
  springScale += (springTarget - springScale) * Math.min(1, dt * (springTarget < springScale ? 10 : 1.4));
  if (!holding && burstPending === 0 && springScale > 0.99) springScale = 1;

  // collapse amount
  collapse += ((holding ? 1 : 0) - collapse) * Math.min(1, dt * 6);
  if (collapse < 0.002) collapse = 0;

  // hover
  const wantHover = mouseOnCanvas && !holding && !isTouch ? 1 : 0;
  hover += (wantHover - hover) * Math.min(1, dt * 8);

  // swing to face text
  if (faceFront && time < faceFrontUntil && !holding && !dragging) {
    const r = camera.position.length();
    const goal = new THREE.Vector3(0, r * Math.sin(0.1), r * Math.cos(0.1));
    camera.position.lerp(goal, Math.min(1, dt * 3.5));
  }
  intensityCur += (intensityGoal - intensityCur) * Math.min(1, dt * 3);
  // auto-rotate pauses after interaction
  controls.autoRotate = time - lastInteraction > 5 && !holding && currentShape !== 'text';
  controls.update();

  // auto cycle shapes
  if (autoCycle && !holding && currentShape !== 'text' && time - lastInteraction > 11 && time - lastMorph > 11) {
    showShape(SHAPE_ORDER[(SHAPE_ORDER.indexOf(lastShape) + 1) % SHAPE_ORDER.length], false);
  }

  // GPU step
  const vu = sys.velVar.material.uniforms, pu = sys.posVar.material.uniforms;
  vu.uDt.value = dt; pu.uDt.value = dt; vu.uTime.value = time;
  vu.uProgress.value = progress;
  vu.uMouse.value.copy(mouseWorld);
  vu.uHover.value = hover;
  vu.uCollapse.value = collapse;
  vu.uBurst.value = burstPending;
  vu.uStiffness.value = 10 * springScale;
  vu.uDamping.value = holding ? 1.2 : burstPending > 0 || springScale < 0.9 ? 1.6 : 4.2;
  vu.uNoiseAmp.value = holding ? 2 : 6;
  if (burstPending > 0) { burstPending = 0; setTimeout(() => { springTarget = 1; }, 250); springTarget = 0.12; }
  sys.gpu.compute();

  const mu = sys.material.uniforms;
  mu.uPos.value = sys.gpu.getCurrentRenderTarget(sys.posVar).texture;
  mu.uVel.value = sys.gpu.getCurrentRenderTarget(sys.velVar).texture;
  mu.uProgress.value = progress;
  mu.uIntensity.value = sys.baseIntensity * intensityCur;
  finalPass.uniforms.uTime.value = time;

  composer.render();

  if (shotResolve) {
    const r = shotResolve; shotResolve = null;
    canvas.toBlob((b) => { if (b) r(b); }, 'image/png');
  }

  // fps
  frames++; fpsAccum += dt;
  if (fpsAccum >= 1) {
    fps = frames / fpsAccum; frames = 0; fpsAccum = 0;
    emit('stars:fps', { fps });
    if (since > 4 && fps < 26) lowStreak++; else lowStreak = 0;
    if (lowStreak >= 3 && TEX > 256 && !forcedN) { lowStreak = 0; rebuild(TEX / 2); }
  }
}

try {
  boot();
} catch (e) {
  console.error(e);
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;color:#fff;font:16px system-ui;background:#000;text-align:center;padding:24px';
  el.textContent = 'This needs a browser with WebGL2 (Chrome, Safari 15+, Firefox). ' + (e as Error).message;
  document.body.appendChild(el);
}
