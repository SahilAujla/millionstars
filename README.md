# A Million Stars

**https://millionstars.pages.dev** — type anything and one million stars will form it.

One million GPU particles (1024² GPGPU simulation in WebGL2) form a spiral galaxy, morph through shapes,
and spell out any text or emoji you type. Hover to carve a hole. Hold the mouse to collapse everything into a
black hole. Release to blow it apart.

Built in one night by Claude Fable 5.1 (with three sub-agents) from a single prompt: *"build a really cool
immersive 3D site, choose whatever it will be about."*

## Run it

```sh
npm i
npm run dev      # http://localhost:5179
npm run build    # dist/
```

## Controls

| action | what happens |
| --- | --- |
| type | the stars form your text (emoji keep their colours) |
| hover | particles scatter away from the cursor |
| hold | black hole: everything spirals into the cursor |
| release | burst |
| drag / scroll | orbit / zoom |
| space | next shape |
| `/` | focus the input |
| H / S / M | hide UI / save PNG / toggle sound |

Deep links: `?t=your%20text`, `?s=galaxy|heart|knot|dna|saturn|sphere`, `?n=512` (particle grid size).

## How it works

- `src/main.ts` — Three.js `GPUComputationRenderer` ping-pongs position and velocity textures. The velocity
  shader is a damped spring toward a target texture, plus simplex-noise drift, hover repulsion, a black-hole
  attractor with tangential swirl, and a one-frame burst impulse. Morphs blend two target textures with a
  per-particle delay so shapes dissolve rather than snap. Bloom, vignette, grain and ACES tone mapping on top.
- `src/shapes.ts` — procedural, seeded shape generators and a canvas text rasteriser that samples pixel colours.
- `src/ui.ts` — the overlay, share-to-X, PNG export, URL state.
- `src/audio.ts` — a procedural Web Audio soundtrack (drone, whoosh, riser, impact). No audio files.

MIT. Notes for maintainers in `NOTES.md`.
