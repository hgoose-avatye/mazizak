# Oil King / Boba U4T — local noise cleanup

The user reported noise in these two current presets. Signal inspection finds a
low-level bed before and after the impact; the existing Oil King build applies 10x
compensation to the entire original clip, including that bed. This supports background
noise as a candidate, but does not identify every subjectively heard artifact.

Applied only to /private/tmp/manzizak-local-presets/{oil-king,boba-u4t}.{wav,json}.
Originals are retained in /private/tmp/manzizak-local-presets-noise-original.
No local source assets are committed or placed in public/.

Processing: estimate a robust pre-impact floor; retain strong transient clusters;
trim to 3 ms before the first meaningful event and at least 24 ms beyond the last;
protect 20 ms after strong events from a bounded soft downward expansion (up to
18 dB); smooth 1.5 ms / 12 ms file boundaries. No pitch shift, EQ or added gain.
Independent keyup is still unsupported; no synthetic release was introduced.

Oil King: 7 clips, summed clip duration 1096 ms -> 524 ms.
Boba U4T: 17 clips, summed clip duration 2852 ms -> 1072 ms.
The original sprite's spacers are not included in these duration totals.
Measured peak changes are at most 0.012 dB / 0.002 dB respectively. Real-data attack
correlation exceeds 0.999 for all 24 clips. Other local preset files retain their hashes.

Validation: 3 DSP fixture tests pass (transient preservation, second impact retention,
short/silent input handling); real-clip checks cover all 24 entries; desktop/mobile
keyboard regression passes 70 checks. Browser tests load the new files without fallback.
Human listening is NOT performed, and acoustic realism/source differentiation remains
separate from this cleanup. Unverified source rights remain unchanged.

Rebuild derivatives with scripts/kbsamples/clean-local-keyboard-noise.py using --input
and a separate --output directory. The script refuses in-place input overwrite.
The old per-context browser buffer cache requires page refresh to hear changed assets.
