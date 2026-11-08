// Procedural particle shapes. Every builder returns N*4 positions (x,y,z,1) and N*4 colors (r,g,b,1).
// All shapes are centered at the origin and fit (roughly) inside a radius-20 sphere.
import type { ShapeData } from './api';

export type BuiltinShape = 'galaxy' | 'sphere' | 'knot' | 'heart' | 'dna' | 'saturn';
export const SHAPE_ORDER: BuiltinShape[] = ['galaxy', 'heart', 'knot', 'dna', 'saturn', 'sphere'];

// ---------- helpers ----------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeGauss(rand: () => number): () => number {
  let spare = 0;
  let has = false;
  return () => {
    if (has) { has = false; return spare; }
    let u = rand();
    if (u < 1e-12) u = 1e-12;
    const v = rand();
    const m = Math.sqrt(-2 * Math.log(u));
    spare = m * Math.sin(6.283185307179586 * v);
    has = true;
    return m * Math.cos(6.283185307179586 * v);
  };
}

function alloc(n: number): ShapeData {
  return { positions: new Float32Array(n * 4), colors: new Float32Array(n * 4) };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function put(d: ShapeData, i: number, x: number, y: number, z: number, r: number, g: number, b: number) {
  const o = i * 4;
  const p = d.positions, c = d.colors;
  p[o] = x; p[o + 1] = y; p[o + 2] = z; p[o + 3] = 1;
  c[o] = clamp01(r); c[o + 1] = clamp01(g); c[o + 2] = clamp01(b); c[o + 3] = 1;
}

type RGB = [number, number, number];
function lerp3(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
/** Piecewise-linear palette lookup, t in 0..1. */
function ramp(stops: RGB[], t: number): RGB {
  t = clamp01(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  return lerp3(stops[i], stops[i + 1], t - i);
}

// ---------- galaxy ----------

function galaxy(n: number): ShapeData {
  const d = alloc(n);
  const rand = mulberry32(0x9a1a);
  const gauss = makeGauss(rand);
  const ARMS = 4;
  const R = 18.5;
  const pitch = 0.22; // tan of pitch angle -> tightness of the log spiral
  const r0 = 1.2;
  const TAU = Math.PI * 2;

  // star-forming clumps placed along the arms
  const CLUMPS = 90;
  const cx = new Float32Array(CLUMPS), cy = new Float32Array(CLUMPS), cz = new Float32Array(CLUMPS);
  for (let k = 0; k < CLUMPS; k++) {
    const r = 4 + rand() * 13.5;
    const arm = k % ARMS;
    const th = Math.log(r / r0) / pitch + (arm * TAU) / ARMS + gauss() * 0.12;
    cx[k] = r * Math.cos(th);
    cz[k] = r * Math.sin(th);
    cy[k] = gauss() * 0.15;
  }

  const nHalo = Math.floor(n * 0.08);
  const nCore = Math.floor(n * 0.16);
  const nClump = Math.floor(n * 0.05);
  const nDust = Math.floor(n * 0.1); // diffuse inter-arm disk
  let i = 0;

  // bulge / core: dense, warm, slightly flattened ellipsoid
  for (let k = 0; k < nCore; k++, i++) {
    const rr = Math.abs(gauss()) * 1.6 + Math.abs(gauss()) * 0.9 * rand();
    let x = gauss(), y = gauss(), z = gauss();
    const l = Math.sqrt(x * x + y * y + z * z) || 1;
    x = (x / l) * rr; y = (y / l) * rr * 0.6; z = (z / l) * rr;
    const heat = Math.exp(-rr * 0.55); // 1 at the very center
    const v = 0.75 + 0.25 * rand();
    put(d, i, x, y, z,
      v * (0.95 + 0.05 * heat),
      v * (0.72 + 0.22 * heat),
      v * (0.42 + 0.48 * heat));
  }

  // spiral arms
  const nArms = n - nHalo - nCore - nClump - nDust;
  for (let k = 0; k < nArms; k++, i++) {
    // exponential-ish radial distribution, avoid crowding the center
    let r = r0 + 1.0 + (-Math.log(1 - rand() * 0.985)) * 4.6;
    if (r > R) r = R - rand() * 4;
    const arm = Math.floor(rand() * ARMS);
    const spread = 0.42 / (1 + r * 0.06); // arms get thinner (in angle) outward
    const off = gauss() * spread;
    const th = Math.log(r / r0) / pitch + (arm * TAU) / ARMS + off;
    const rj = r + gauss() * 0.45;
    const x = rj * Math.cos(th);
    const z = rj * Math.sin(th);
    const thick = 0.12 + 0.75 * Math.exp(-r / 5);
    const y = gauss() * thick;
    // blue-white arms; points at the trailing (inner) edge are dimmer -> dust lane look
    const t = r / R;
    const edge = Math.abs(off) / (spread * 2.2);
    const dust = off < 0 ? 0.75 + 0.25 * (1 - clamp01(edge)) : 1;
    const v = (0.62 + 0.38 * rand()) * dust * (1 - 0.25 * t);
    const warm = Math.exp(-r / 3.5); // inner arms blend into the warm core
    const c = lerp3([0.62, 0.76, 1.0], [1.0, 0.86, 0.62], warm);
    // occasional bright blue-white giant stars
    const giant = rand() < 0.02 ? 1.25 : 1;
    put(d, i, x, y, z, c[0] * v * giant, c[1] * v * giant, c[2] * v * giant);
  }

  // diffuse disk between arms
  for (let k = 0; k < nDust; k++, i++) {
    const r = 2 + Math.sqrt(rand()) * (R - 2);
    const th = rand() * TAU;
    const y = gauss() * (0.15 + 0.6 * Math.exp(-r / 5));
    const v = 0.3 + 0.2 * rand();
    put(d, i, r * Math.cos(th), y, r * Math.sin(th), v * 0.85, v * 0.88, v * 1.1);
  }

  // pink star-forming regions
  for (let k = 0; k < nClump; k++, i++) {
    const c = Math.floor(rand() * CLUMPS);
    const s = 0.25 + 0.35 * rand();
    const v = 0.7 + 0.3 * rand();
    put(d, i, cx[c] + gauss() * s, cy[c] + gauss() * s * 0.4, cz[c] + gauss() * s,
      v * 1.0, v * (0.42 + 0.15 * rand()), v * (0.62 + 0.2 * rand()));
  }

  // halo: sparse sphere of old stars
  for (; i < n; i++) {
    let x: number, y: number, z: number, l2: number;
    do { x = rand() * 2 - 1; y = rand() * 2 - 1; z = rand() * 2 - 1; l2 = x * x + y * y + z * z; } while (l2 > 1 || l2 < 0.01);
    const s = 19.5 * Math.pow(rand(), 0.7) / Math.sqrt(l2);
    const v = 0.3 + 0.35 * rand();
    put(d, i, x * s, y * s * 0.8, z * s, v * 1.0, v * 0.92, v * 0.85);
  }
  return d;
}

// ---------- sphere ----------

function sphere(n: number): ShapeData {
  const d = alloc(n);
  const rand = mulberry32(0x5f3e);
  const gauss = makeGauss(rand);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const stops: RGB[] = [[0.18, 0.28, 0.85], [0.25, 0.55, 1.0], [0.3, 0.9, 1.0], [1.0, 1.0, 1.0]];
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const rr = Math.sqrt(1 - y * y);
    const phi = i * golden;
    const rad = 16 * (1 + gauss() * 0.025 + (rand() < 0.04 ? rand() * 0.08 : 0));
    const c = ramp(stops, (y + 1) / 2 + gauss() * 0.03);
    const v = 0.8 + 0.2 * rand();
    put(d, i, Math.cos(phi) * rr * rad, y * rad, Math.sin(phi) * rr * rad, c[0] * v, c[1] * v, c[2] * v);
  }
  return d;
}

// ---------- torus knot ----------

function knot(n: number): ShapeData {
  const d = alloc(n);
  const rand = mulberry32(0x7a07);
  const gauss = makeGauss(rand);
  const P = 2, Q = 3, S = 4.3, TUBE = 2.5;
  const TAU = Math.PI * 2;
  const curve = (t: number, out: Float64Array) => {
    const r = Math.cos(Q * t) + 2;
    out[0] = r * Math.cos(P * t) * S;
    out[1] = r * Math.sin(P * t) * S;
    out[2] = -Math.sin(Q * t) * S;
  };
  const a = new Float64Array(3), b = new Float64Array(3);
  const stops: RGB[] = [[0.15, 0.85, 0.8], [1.0, 0.78, 0.28], [1.0, 0.3, 0.62], [0.15, 0.85, 0.8]];
  for (let i = 0; i < n; i++) {
    const t = rand() * TAU;
    curve(t, a);
    curve(t + 1e-3, b);
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
    const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
    tx /= tl; ty /= tl; tz /= tl;
    // random direction perpendicular to the tangent
    let vx = gauss(), vy = gauss(), vz = gauss();
    const dot = vx * tx + vy * ty + vz * tz;
    vx -= dot * tx; vy -= dot * ty; vz -= dot * tz;
    const vl = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
    const surface = rand() < 0.7;
    const rad = surface ? TUBE * (0.94 + 0.06 * rand()) : TUBE * Math.sqrt(rand()) * 0.95;
    const k = rad / vl;
    const c = ramp(stops, t / TAU);
    const v = surface ? 0.8 + 0.2 * rand() : 0.45 + 0.25 * rand();
    put(d, i, a[0] + vx * k, a[1] + vy * k, a[2] + vz * k, c[0] * v, c[1] * v, c[2] * v);
  }
  return d;
}

// ---------- heart ----------

function heart(n: number): ShapeData {
  const d = alloc(n);
  const rand = mulberry32(0x4ea7);
  const TAU = Math.PI * 2;
  const H = 6.5; // half-thickness at the center
  const YOFF = 1.5;
  const S = 0.98;
  const hx = (t: number) => { const s = Math.sin(t); return 16 * s * s * s; };
  const hy = (t: number) => 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  // max |c(t)|^2 for area-weighted rejection of t
  let maxR2 = 0;
  for (let k = 0; k < 512; k++) {
    const t = (k / 512) * TAU;
    const x = hx(t), y = hy(t);
    maxR2 = Math.max(maxR2, x * x + y * y);
  }
  for (let i = 0; i < n; i++) {
    let t: number, bx: number, by: number;
    do {
      t = rand() * TAU; bx = hx(t); by = hy(t);
    } while (rand() * maxR2 > bx * bx + by * by);
    const surface = rand() < 0.6;
    let s: number, z: number, r: number, g: number, b: number;
    if (surface) {
      s = Math.sqrt(rand());
      const h = H * Math.sqrt(Math.max(0, 1 - s * s)) * (0.97 + 0.03 * rand());
      z = (rand() < 0.5 ? -1 : 1) * h;
      // hot white-pink skin, hotter toward the rim
      const k = clamp01(s * s * 0.8 + rand() * 0.35);
      const v = 0.8 + 0.2 * rand();
      r = v; g = v * (0.35 + 0.55 * k); b = v * (0.5 + 0.45 * k);
    } else {
      s = Math.pow(rand(), 0.4);
      const h = H * Math.sqrt(Math.max(0, 1 - s * s));
      z = (rand() * 2 - 1) * h * 0.95;
      const v = 0.55 + 0.35 * rand();
      const k = rand() * 0.4;
      r = v; g = v * (0.1 + 0.3 * k); b = v * (0.18 + 0.3 * k);
    }
    put(d, i, bx * s * S, (by * s + YOFF) * S, z, r, g, b);
  }
  return d;
}

// ---------- DNA ----------

function dna(n: number): ShapeData {
  const d = alloc(n);
  const rand = mulberry32(0xd7a0);
  const gauss = makeGauss(rand);
  const HALF = 18, RAD = 6, PITCH = 12;
  const W = (Math.PI * 2) / PITCH;
  const RUNG_STEP = 1.6;
  const rungCount = Math.floor((HALF * 2) / RUNG_STEP);
  const rung0 = -((rungCount - 1) * RUNG_STEP) / 2;
  const nStrand = Math.floor(n * 0.74);
  const nRung = Math.floor(n * 0.2);
  let i = 0;
  for (let k = 0; k < nStrand; k++, i++) {
    const y = (rand() * 2 - 1) * (HALF - 0.8);
    const strand = k & 1;
    const th = y * W + strand * Math.PI;
    const tube = rand() < 0.6 ? 0.55 : 0.3;
    const v = 0.72 + 0.28 * rand();
    const x = Math.cos(th) * RAD + gauss() * tube;
    const z = Math.sin(th) * RAD + gauss() * tube;
    const yy = y + gauss() * tube * 0.6;
    if (strand === 0) put(d, i, x, yy, z, 0.2 * v, 0.85 * v, 1.0 * v);
    else put(d, i, x, yy, z, 1.0 * v, 0.55 * v, 0.16 * v);
  }
  for (let k = 0; k < nRung; k++, i++) {
    const ri = Math.floor(rand() * rungCount);
    const y = rung0 + ri * RUNG_STEP;
    const th = y * W;
    const ax = Math.cos(th) * RAD, az = Math.sin(th) * RAD;
    const u = rand();
    const x = ax * (1 - 2 * u) + gauss() * 0.14;
    const z = az * (1 - 2 * u) + gauss() * 0.14;
    // white core, faintly tinted toward each strand's color at the ends
    const e = Math.abs(u - 0.5) * 2;
    const v = 0.75 + 0.25 * rand();
    const tint: RGB = u < 0.5 ? [0.6, 0.92, 1.0] : [1.0, 0.8, 0.6];
    const c = lerp3([0.95, 0.95, 1.0], tint, e * e);
    put(d, i, x, y + gauss() * 0.12, z, c[0] * v, c[1] * v, c[2] * v);
  }
  // faint sparkle cloud around the helix
  for (; i < n; i++) {
    const y = (rand() * 2 - 1) * HALF;
    const th = rand() * Math.PI * 2;
    const r = RAD * (0.3 + 0.9 * rand());
    const v = 0.3 + 0.25 * rand();
    put(d, i, Math.cos(th) * r, y, Math.sin(th) * r, v * 0.8, v * 0.9, v);
  }
  return d;
}

// ---------- saturn ----------

function saturn(n: number): ShapeData {
  const d = alloc(n);
  const rand = mulberry32(0x5a70);
  const gauss = makeGauss(rand);
  const PR = 8, RIN = 11, ROUT = 19, GAP0 = 15.0, GAP1 = 15.8;
  const tilt = (27 * Math.PI) / 180;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const nPlanet = Math.floor(n * 0.4);
  const bands: RGB[] = [[1.0, 0.93, 0.74], [0.86, 0.68, 0.45], [0.96, 0.78, 0.38], [0.8, 0.62, 0.42], [1.0, 0.9, 0.68]];
  for (let i = 0; i < n; i++) {
    let x: number, y: number, z: number, r: number, g: number, b: number;
    if (i < nPlanet) {
      let ux = gauss(), uy = gauss(), uz = gauss();
      const l = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
      const rad = rand() < 0.85 ? PR * (0.97 + 0.03 * rand()) : PR * Math.cbrt(rand());
      ux /= l; uy /= l; uz /= l;
      x = ux * rad; y = uy * rad * 0.94; z = uz * rad;
      // latitude bands with wobble
      const lat = uy + 0.04 * Math.sin(Math.atan2(uz, ux) * 3 + uy * 8);
      const bt = 0.5 + 0.5 * Math.sin(lat * 13.0) * Math.cos(lat * 5.0);
      const c = ramp(bands, bt);
      const v = (0.72 + 0.28 * rand()) * (rad < PR * 0.95 ? 0.6 : 1);
      r = c[0] * v; g = c[1] * v; b = c[2] * v;
    } else {
      let rr: number, keep: boolean;
      do {
        rr = Math.sqrt(RIN * RIN + rand() * (ROUT * ROUT - RIN * RIN));
        keep = !(rr > GAP0 && rr < GAP1);
        // ringlet density modulation
        if (keep) keep = rand() < 0.55 + 0.45 * Math.sin(rr * 7.3) * Math.sin(rr * 2.1 + 1.0);
        if (keep && rr > 18.2) keep = rand() < 0.4; // faint outer edge
      } while (!keep);
      const th = rand() * Math.PI * 2;
      x = rr * Math.cos(th); z = rr * Math.sin(th); y = gauss() * 0.07;
      const k = (rr - RIN) / (ROUT - RIN);
      const c = lerp3([0.78, 0.72, 0.6], [0.92, 0.8, 0.52], 0.5 + 0.5 * Math.sin(rr * 3.1));
      const v = (0.6 + 0.35 * rand()) * (k < 0.15 ? 0.7 : 1);
      r = c[0] * v; g = c[1] * v; b = c[2] * v;
    }
    // tilt everything about x
    const yy = y * ct - z * st;
    const zz = y * st + z * ct;
    put(d, i, x, yy, zz, r, g, b);
  }
  return d;
}

// ---------- public ----------

const cache = new Map<string, ShapeData>();

export function buildShape(name: BuiltinShape, n: number): ShapeData {
  const key = name + ':' + n;
  const hit = cache.get(key);
  if (hit) return hit;
  let d: ShapeData;
  switch (name) {
    case 'sphere': d = sphere(n); break;
    case 'knot': d = knot(n); break;
    case 'heart': d = heart(n); break;
    case 'dna': d = dna(n); break;
    case 'saturn': d = saturn(n); break;
    case 'galaxy':
    default: d = galaxy(n); break;
  }
  cache.set(key, d);
  return d;
}

export function randomCloud(n: number, radius: number): ShapeData {
  const d = alloc(n);
  const rand = mulberry32(0xc10d);
  const p = d.positions, c = d.colors;
  for (let i = 0; i < n; i++) {
    let x: number, y: number, z: number;
    do { x = rand() * 2 - 1; y = rand() * 2 - 1; z = rand() * 2 - 1; } while (x * x + y * y + z * z > 1);
    const o = i * 4;
    p[o] = x * radius; p[o + 1] = y * radius; p[o + 2] = z * radius; p[o + 3] = 1;
    const v = 0.28 + 0.14 * rand();
    c[o] = v * 0.85; c[o + 1] = v * 0.92; c[o + 2] = v * 1.2; c[o + 3] = 1;
  }
  return d;
}

const CW = 2048, CH = 768;
let textCanvas: HTMLCanvasElement | null = null;
const FONT = (px: number) =>
  `900 ${px}px system-ui, -apple-system, "Segoe UI", Roboto, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;

export function textToShape(text: string, n: number): ShapeData {
  if (!text || !text.trim()) return buildShape('galaxy', n);
  if (!textCanvas) {
    textCanvas = document.createElement('canvas');
    textCanvas.width = CW;
    textCanvas.height = CH;
  }
  const ctx = textCanvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
  if (!ctx) return buildShape('galaxy', n);
  ctx.clearRect(0, 0, CW, CH);

  // fit the largest font size with 5% padding
  const availW = CW * 0.9, availH = CH * 0.9;
  ctx.font = FONT(100);
  const m0 = ctx.measureText(text);
  const w0 = Math.max(1, (m0.actualBoundingBoxLeft || 0) + (m0.actualBoundingBoxRight || m0.width));
  const h0 = Math.max(1, (m0.actualBoundingBoxAscent || 72) + (m0.actualBoundingBoxDescent || 20));
  const size = Math.max(8, Math.floor(100 * Math.min(availW / w0, availH / h0)));
  ctx.font = FONT(size);
  const m = ctx.measureText(text);
  const asc = m.actualBoundingBoxAscent || size * 0.72;
  const desc = m.actualBoundingBoxDescent || size * 0.2;
  const left = m.actualBoundingBoxLeft || m.width / 2;
  const right = m.actualBoundingBoxRight || m.width / 2;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, CW / 2 + (left - right) / 2, CH / 2 + (asc - desc) / 2);

  const img = ctx.getImageData(0, 0, CW, CH).data;
  // collect opaque pixels
  let count = 0;
  for (let k = 3; k < img.length; k += 4) if (img[k] > 100) count++;
  if (count === 0) return buildShape('galaxy', n);
  const idx = new Int32Array(count);
  let minX = CW, maxX = 0, minY = CH, maxY = 0;
  let j = 0;
  for (let y = 0; y < CH; y++) {
    const row = y * CW;
    for (let x = 0; x < CW; x++) {
      const p = row + x;
      if (img[(p << 2) | 3] > 100) {
        idx[j++] = p;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const scale = Math.min(36 / bw, 26 / bh);
  const mx = (minX + maxX + 1) / 2, my = (minY + maxY + 1) / 2;

  // palette LUT across x: warm white -> gold -> cyan
  const LUT = 256;
  const lut = new Float32Array(LUT * 3);
  const pal: RGB[] = [[1.0, 0.93, 0.82], [1.0, 0.76, 0.32], [0.35, 0.88, 1.0]];
  for (let k = 0; k < LUT; k++) {
    const t = k / (LUT - 1);
    // slow, slightly wavy sweep so short words still get some variety
    const c = ramp(pal, clamp01(t + 0.08 * Math.sin(t * 9.0)));
    lut[k * 3] = c[0]; lut[k * 3 + 1] = c[1]; lut[k * 3 + 2] = c[2];
  }
  const lutScale = (LUT - 1) / Math.max(1, bw);

  const d = alloc(n);
  const pos = d.positions, col = d.colors;
  let a = 0x7e47 >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const inv255 = 1 / 255;
  for (let i = 0; i < n; i++) {
    const p = idx[(rnd() * count) | 0];
    const px = p & 2047; // CW === 2048
    const py = p >> 11;
    const fx = px + rnd() - 0.5 + 0.5;
    const fy = py + rnd() - 0.5 + 0.5;
    const o = i * 4;
    pos[o] = (fx - mx) * scale;
    pos[o + 1] = -(fy - my) * scale;
    pos[o + 2] = (rnd() + rnd() + rnd() - 1.5) * 0.7; // ~gaussian, sigma 0.35
    pos[o + 3] = 1;
    const q = p * 4;
    const r = img[q], g = img[q + 1], b = img[q + 2];
    const noise = 0.9 + 0.2 * rnd();
    let cr: number, cg: number, cb: number;
    const mxc = r > g ? (r > b ? r : b) : (g > b ? g : b);
    const mnc = r < g ? (r < b ? r : b) : (g < b ? g : b);
    if (mnc > 200 && mxc - mnc < 24) {
      const li = ((px - minX) * lutScale) | 0;
      cr = lut[li * 3]; cg = lut[li * 3 + 1]; cb = lut[li * 3 + 2];
    } else {
      // emoji / colored glyph pixel: keep hue, lift darks so they still glow
      cr = 0.15 + 0.85 * r * inv255;
      cg = 0.15 + 0.85 * g * inv255;
      cb = 0.15 + 0.85 * b * inv255;
    }
    cr *= noise; cg *= noise; cb *= noise;
    col[o] = cr > 1 ? 1 : cr;
    col[o + 1] = cg > 1 ? 1 : cg;
    col[o + 2] = cb > 1 ? 1 : cb;
    col[o + 3] = 1;
  }
  return d;
}
