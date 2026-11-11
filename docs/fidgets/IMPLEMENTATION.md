# Playable fidget implementation

Branch: feat/fidgets-10. Isolated worktree: /private/tmp/manzizak-fidgets.
The original dirty keyboard worktree was preserved through snapshot f3ede6889349326359efbeae9aba6ec582737111; no push or merge.

Implemented: L01 cheese, L02 mango, L03 whipped cream; S01 TPR jelly,
S02 slow-rise foam, S03 mochi; W01 apple wax, W02 chocolate wax;
C01 soap crunch, C02 sugar beads. All ten accept actual surface input and
trigger recorded-buffer audio. Existing ten keyboards remain available in local development.

Shared mechanics: local dents with spring/foam recovery, viscous directional stretch
and gathering/folding, per-face wax fracture with exposed deformable core,
and instanced crushable soap / colliding beads. Up to four simultaneous surface
contacts (foam two), bounded geometry/particles, on-demand rendering and adaptive DPR.
Reset restores contacts, dents, folds, shell and particles; leaving stops gesture audio.

Audio: existing CC0 squishy WAV samples plus eight original apple77771 recordings
under CC BY 4.0. See app/public/sfx/wax/CREDITS.md. Slime/soap/bead/foam-rise
sounds are processed foley, not exact-toy recordings. Pixabay Slime Squish 7 was
identified but not acquired or included.

Validation: TypeScript and production build pass; 135 unit tests pass, one skipped.
Real Chrome mobile viewport: 71 fidget checks, including actual surface input,
recorded AudioBuffer scheduling, two-finger stretching/folding, wax core input,
soap crushing, bead collisions, reset, mute and rapid switching. Existing keyboard
regression: 70 checks on desktop/mobile viewports. No page errors.

Limitations: procedural prototype visuals; no verified final product assets.
Folding is a persistent deformation approximation, not self-colliding material.
Cracks use face damage/separation, not volumetric fracture. No human listening,
real-device performance validation or exact-toy recording certification performed.
Build retains its >500 kB main-chunk warning; mobile hardware profiling is outstanding.

Local: http://127.0.0.1:4354/
Run from app with MANZIZAK_LOCAL_AUDIO_DIR=/private/tmp/manzizak-local-presets
npm run dev -- --host 127.0.0.1 --port 4354 --strictPort.
Four pre-existing local keyboard sample packs stay outside public assets.
