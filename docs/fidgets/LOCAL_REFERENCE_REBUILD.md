# Local fidget reference rebuild

The user requested the installed 왁뿌볼 / 왁뿌 / 뿌왁 applications as references
and authorized local implementation and reflection on port 4354.

## Observed sources

- /Applications/Runner.app — CFBundleDisplayName 왁뿌볼; Flutter assets.
  Runtime observed: smooth green apple wax ball, rounded tied neck, selectable materials.
- /Applications/app.app and /Applications/app 2.app — CFBundleDisplayName 왁뿌;
  Hermes 98 / 96 bytecode. The newer package contains first/break/slime WAV pools.
- /Applications/Wakppu.app — CFBundleDisplayName 뿌왁; native USDZ models,
  authored textures, material-specific WAV recordings. Runtime observed: wax / squishy /
  slime categories on a minimal warm background.

These observations came from ordinary package inventory, plist reads and desktop captures,
not decompiled native functions. REA doctor reported no registered server or native analysis
engine; no client configuration was changed. Internal native physics remains unknown.

## Implemented changes

All ten remain playable. Four decimated local reference meshes are loaded with their UVs
and textures: cheese, mango, bread (foam), peach mochi. Mango's green reference texture is
recolored to golden yellow while preserving luminance detail. The USD conversion clears
image/material caches between assets to avoid same-filename texture substitution.
Meshes have roughly 3–6k vertices; runtime texture size is capped at 1024.

Other surfaces are reconstructed in repository code: translucent TPR with internal bubbles,
a piped cream rosette, smooth curved wax shells grouped into 104 apple / 42 chocolate
fracture patches, 96 crushable soap chips and 220 colliding beads. Each has its own
background, silhouette, roughness and response. Particle graphics are instanced.
The wax core is directly touchable through missing patches. Reset restores all states.
Slime gesture coordinates use a fixed gesture camera so visual camera fitting does not
amplify dragging; stretch is relative to body width, not a tiny initial finger gap.

61 original WAV files are mapped locally to press, compression, stretch, fold, crack,
knead and crunch. Source onset/tail silence is trimmed; fades and bounded gain normalization
are applied after decoding. No claim is made that reference squishy/crunch recordings are
recordings of our exact TPR, foam or sugar-bead objects. In particular C02 uses pudding
crunch as material-reference foley. Release/bubble roles can retain derived CC0 layers.
Gesture loops stop when motion stops; stationary holds do not replay compression indefinitely.

## Local asset boundary

Installed application artwork/audio redistribution rights are unverified. Their original
and converted bytes and rendered thumbnails live ONLY in:
/private/tmp/manzizak-fidget-reference-assets

They are NOT committed, copied into public/, or emitted by production builds.
manifest.json records original absolute paths, file sizes and SHA-256 identities.
MANZIZAK_LOCAL_FIDGET_DIR enables a loopback-only development resource route.
The manifest is required when this explicit local mode is enabled; failures are surfaced,
not described as successful reference loading. Public builds use the existing licensed
CC0 / CC BY audio and repository procedural forms.

Recreate local audio/manifest: python3 app/scripts/prepare-fidget-references.py
Recreate local models: run installed Blender in background with
--python app/scripts/convert-fidget-models.py

Run from app:
MANZIZAK_LOCAL_AUDIO_DIR=/private/tmp/manzizak-local-presets \
MANZIZAK_LOCAL_FIDGET_DIR=/private/tmp/manzizak-fidget-reference-assets \
npm run dev -- --host 127.0.0.1 --port 4354 --strictPort

## Limits

This is a playable local reconstruction, not verified parity with native physics.
Folding and incompressibility are bounded deformation approximations; shell fragments
are curved surface patches rather than volumetric FEM fragments. Final product assets,
human acoustic comparison and physical mobile-device validation remain unverified.

## Final verification

TypeScript / production build pass (existing >500 kB bundle warning remains).
135 unit tests pass; one skipped. Actual Chrome mobile viewport passes 71 fidget
interaction checks after final stretch/camera correction. Existing keyboard regression
passes 70 desktop/mobile checks. Reference review confirms all 10 local audio profiles
and all four intended model/texture loads, with no page errors. Screenshot checks
include initial material appearance and the three stretched slime forms.
No human listening or physical-device testing is claimed.
