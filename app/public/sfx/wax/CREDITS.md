# MANZIZAK fidget audio credits

WAK-PPU-BALL sound effects by apple77771, licensed under CC BY 4.0.
Source: https://github.com/apple77771/wakppuball-simulator
Pinned commit: 6882bebcc312b3be3b871b0729e22ceacf5a2f01
Copyright (c) 2026 apple77771.
License: https://creativecommons.org/licenses/by/4.0/ — upstream notice preserved in LICENSE.md.

The original MP3 files below are kept **unmodified** in this folder (nothing in the app plays them directly any more).
They are cut into short clips at build time by `scripts/fidgets/build-clips.mjs`; the clips (modified, CC BY 4.0 change notice) and their
source times are in `../fidgets/wax.json` and `../fidgets/CREDITS.md`. Original recordings: apple_crack_1/2, apple_knead_1/2,
choco_crack_1/2, choco_knead_1/2. The upstream audio license states these are
original recordings made by its maintainer. Clip processing now happens at build time (cut, fades, normalisation); runtime only applies small speed/pitch jitter and gain.

W01 uses apple crack/knead; W02 uses chocolate crack/knead. C01/C02 no longer use wax fragments: they now use separate CC0 recordings,
see `../fidgets/CREDITS.md`.

Other fidgets reuse the existing CC0 squishy recordings; full attribution and changes:
../squishy/CREDITS.md. Sources include breadparticles gel squelches, real cushion/foam
compression, qubodup dry sponge friction, and mistakenforathing rubber-glove stretching.
Slime/TPR/mochi/bubbles are material-inspired edited layers of these recordings, not
new recordings of those exact toys. Foam recovery is slowed/filtered/reversed source
material, not a direct recording of foam rising.

Pixabay Slime Squish 7 was previously referenced but never downloaded or verified;
it is NOT included. No newly synthesized audio or unlicensed video extraction is used.
Human listening and real-device acoustic verification have NOT been performed.
