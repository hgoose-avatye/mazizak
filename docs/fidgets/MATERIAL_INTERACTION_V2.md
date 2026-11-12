# Material interaction revision

## Approved scope and retained slots

Oil King / Boba U4T are removed from all selectable UI and rejected by the recording
loader, including direct calls. Saved selections reset to an enabled preset. Their IDs,
visual palettes, original/cleaned WAV+JSON files and research provenance are retained
for later replacement. Eight keyboards remain playable; ten fidgets remain available.
RETIRED_KEY_PRESETS is the deliberate reactivation boundary.

## Reference actually inspected

User video: https://www.youtube.com/shorts/7WDcH26JU5Q — “알리 치즈 슬랑이 만져보기🧀 ASMR”,
[DEW]Yenlin. Exact source-video frames at 20–29s were decoded at 2 fps and inspected.
They show a pale smooth membrane with bulky filling bulging between the hands,
broad spreading/poking and gathering, rather than a rigid Swiss-cheese block with holes.
The original textured cheese model is retained in the external local asset folder.
L01 now uses a soft sealed pillow silhouette.

Seven visually aligned local soundtrack windows cover compression (20–21, 23–24s),
stretching (24.3–25, 25.8–26.5, 28.3–29s) and gathering (21–22, 27.8–28.4s).
These are approximate visual annotations, not audio-isolation results. The soundtrack
has not been listened to by the agent and is not certified speech/BGM-free. Rights are
unverified: all WAVs, video and reference frames stay outside public/ and git. See
scripts/prepare-cheese-reference.py and external cheese-cues.json / manifest.json.
No source download URL tokens are copied into project documentation.

The submitted audio specification stops at its section 2 heading. The implementation
therefore uses compression, material travel/stretch, gathering, fracture and filling
work as explicit gesture routes, with no invented release/pop route.

## Shared material solver

cage.ts implements one 216-node tetrahedral cage with fixed 120 Hz substeps, membrane
edge constraints, local-volume constraints, damping and rest-shape forces. Original
mesh UVs/textures stay intact through cage displacement embedding. Pressure transfers
to surrounding nodes and the contents; the whole mesh is not uniformly scaled.
Profiles distinguish compressible slow foam, elastic gel/mochi, viscous filled skins,
crunch contents and a wax-covered core. Pen pressure is forwarded where available;
mouse/touch defaults use a bounded onset and creep response, not measured physical force.
Inverse embedding attaches repeated squeezes to already moving material. Visible sugar
micrograins remain coupled to the smaller filling model and retain bounded redistribution.
Foam retains its delayed monotonic dent-memory controller. Reset clears cage velocity,
material memory, particles, fracture and all active pointer/audio state.

This is a bounded position-based approximation, not Navier–Stokes, FEM, full membrane
self-collision or volumetric material rupture. Gathering uses a rest-pose constraint;
true self-colliding folding is not claimed. Mobile hardware parity is unverified.

## Wax correction

Closed curved Voronoi cells replace UV-grid triangle-group boundaries. Each cell has
an outer face, pale inner face and physical thin cut rim. Direct hit patch identity is
passed to local strain evaluation, so a large patch need not be pressed at its center.
Damage tracks local deformation; elapsed hold time does not spread failure over the
whole shell. Broken cells settle inward against the gel rather than receiving outward
explosion impulses. The exposed core remains directly touchable; reset restores coating.

## Sound correction

All generic release/reversed-recovery sounds, arbitrary bubble timers, duplicate
press+compression attacks and one-shot-as-loop paths are removed from fidgets.
One material voice per toy follows actual compression/travel or grouped fracture work;
quiet holds and the last pointer release fade playback. Cues are segmented at envelope
quiet gaps, level-balanced downward with peak headroom, and never pitch shifted.
No exact-material quality claim is inferred from a package filename.

S02 uses the existing CC0 PU-foam contact recording; it does not play butter squishy,
couch/plastic compression or the reversed 1.82s recovery effect. Exact slow-rise squeeze
recording is still missing. S03 keeps its local skin reference at a much quieter target
RMS and has no cloth-touch release, rubbing loop or wet duplicate. L03 uses clearly
marked gel-contact approximation instead of the high-frequency sherbet crunch source.
Local L01 uses the user's video windows; other exact-material recording gaps remain
explicit in diagnostic source labels. Public builds continue to use licensed CC0/CC BY
material only; the installed-app/video resources are not copied into production assets.

## Validation

TypeScript and production build pass (existing main-chunk size warning remains).
Unit coverage includes fixed-step consistency, neighbouring-volume transfer, restoration,
and opposed grips producing a free-surface bulge, plus retired-slot fetch rejection.
Chrome: 89 material/gesture checks, 71 general fidget checks, 56 keyboard checks pass.
The 89 checks verify actual source starts, mesh movement, bounded volume, slow foam
mesh recovery, no invented release/pop roles, no impact loops, localized wax failure,
no outward shard explosion, reset, two-finger compression and retained WAV/JSON hashes.
No page errors. Video frame sheets and rendered states were visually inspected; this is not
physical-device or human acoustic validation.

Observed one-point material volume ratios were approximately 0.94 for foam and
0.97–1.00 for fluid-filled toys under this bounded gesture. These numbers describe
this solver and test, not measured properties of the physical products.

Local test: http://127.0.0.1:4354/#/L01
The user-video soundtrack and original applications remain local reference resources.
