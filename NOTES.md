# A Million Stars — notes for the next agent

Built Nov 8 2026, 04:09–04:45 AM EST, during a usage-burn sprint (session D, Claude Fable 5.1
with three delegate sub-agents). **Unreviewed sprint work.** It runs and was tested in the T3 Code
built-in browser (Chromium, 1683×1052) on Sahil's Mac only. Not tested on a phone, Safari or Firefox.

## What it is
One million (1024²) GPU particles rendered with Three.js. They form a spiral galaxy, morph through
shapes (galaxy, heart, knot, dna, saturn, sphere) and into any text or emoji the user types.
Hover carves a hole; hold the pointer and everything collapses into a swirling black hole; release
and it bursts. Share-to-X intent, save PNG, `?t=<text>` deep links, procedural WebAudio soundtrack.

- Live: https://millionstars.pages.dev (Cloudflare Pages project `millionstars`, account 897ee007…)
- Repo: https://github.com/SahilAujla/millionstars
- Dev: `npm i && npm run dev` (port 5179). Build: `npm run build` → `dist/`.
- Deploy: `script -q /dev/null npx wrangler pages deploy dist --project-name millionstars --branch main --commit-dirty=true`
  (wrangler needs the `script` pty wrapper from Claude Code, see ~/.claude/CLAUDE.md).

## Architecture (src/)
- `main.ts` — engine. GPUComputationRenderer ping-pong textures: `texturePosition`, `textureVelocity`
  (1024×1024 RGBA float). Velocity shader = spring to target + simplex "flow" drift + hover repel +
  collapse (attract + tangential swirl + drag) + one-frame burst impulse + exponential damping.
  Morph: two target textures A/B (positions) + colour textures A/B; `uProgress` 0→1 with a per-particle
  hash delay so shapes dissolve organically. `setTargets()` shifts B→A and uploads the new B.
  Post: EffectComposer (HalfFloat) → UnrealBloom (0.7 / 0.5 / 0.35) → vignette+grain pass → OutputPass
  (ACES). `window.stars` implements `StarsAPI` from `api.ts`; events `stars:ready|morph|collapse|burst|fps`.
  Adaptive quality: 512² on touch devices, drops a level if fps < 26 for 3 s. `?n=256|512|1024` forces.
  `?t=` text and `?s=` shape read on boot. Text shows the camera swinging to a front view and dims
  intensity to 0.42× (text is dense, otherwise it blows out).
- `shapes.ts` — deterministic (mulberry32) generators returning `{positions, colors}` N×4 floats;
  `textToShape()` rasterises text on a 2048×768 canvas with `900 system-ui` and samples pixel colours
  (so emoji keep their colours). ~280 ms for 1M points; fine behind the 120 ms input debounce.
- `ui.ts` / `style.css` / `index.html` — overlay (intro title, input, shape pills, toolbar: sound,
  save image, post on X, copy link, hide UI; keyboard: `/` focus, Esc, space next, H hide, S save, M mute).
  OG/Twitter card tags point at https://millionstars.pages.dev/og.png (a 1280×800 screenshot of "@sahil ✨").
- `audio.ts` — Web Audio only: drone + convolver reverb, whoosh on morph, riser on collapse, impact on burst.
  Off by default; toggled from the toolbar (first gesture starts the context).

## Known gaps / ideas (in rough priority)
1. **Mobile untested.** Touch hold → collapse uses a 170 ms timer vs OrbitControls drag. Check iOS Safari
   float-texture support (GPUComputationRenderer needs EXT_color_buffer_float; fall back to HalfFloat if
   `gpu.init()` errors — currently we just throw and show a message).
2. Burst verified on production at 04:29 (hold 1.6 s → galaxy collapses to a bright ball; release → radial
   streaks). Feel is tunable via `uBurst * 46.0` and the 250 ms `springTarget = 0.12` window in main.ts.
3. Galaxy core is still hot. Lower the bulge density in `shapes.ts` or add a soft per-shape intensity.
4. The credit link in the bottom-right (`ui.ts`, href `#`) should point at Sahil's X profile.
5. No analytics, no custom domain. `millionstars.pages.dev` is the only URL.
6. Record a 10–15 s clip for the tweet: galaxy intro → type a handle → hold → release.
7. Possible virality features: multi-line text, `?t=` autoplay sequence, "spell my name" OG image generated
   per `?t=` (needs a worker), WebGPU path for 4M particles.

## Incident log
- 04:22 — `wrangler pages project create` (wrangler 4.158) delegated to Workers and rewrote `package.json`
  (added `@cloudflare/vite-plugin` + `wrangler` devDeps, pruned `three` from node_modules because a racing
  `npm i` at scaffold time had left it out of `dependencies`). Fixed at 04:28: `three@0.170.0` is now a real
  dependency, the Cloudflare devDeps are removed. Always deploy with plain `wrangler pages deploy dist …`.
- 04:26 — `textToShape` measured text with left alignment but drew centred, shifting wide strings a quarter
  width left (clipped). Fixed by setting `textAlign='center'` before measuring.
