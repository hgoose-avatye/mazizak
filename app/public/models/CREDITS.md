# Shipped 3D models: 모닝빵 (S02) and 찹쌀떡 (S03)

The game shows these two toys with 3D models taken from a reference app (other people's work), not with models made for this project.
**The project owner chose to ship them in the public build and stated on 2026-11-16 that permission to use them has been obtained.**
That is the owner's statement: the permission terms are not stored in this repository, and the exact app / file the models came from is not
recorded here (the originals stay in the owner's local reference folder, `~/Music/MANZIZAK/dev-reference/fidgets/models/`). If the permission
requires a specific credit, add it to this file and to the settings sheet (`index.html`).

To withdraw them: delete the two entries of `SHIPPED_MODELS` in `src/toys/fidgets/references.ts` and the files in this folder; the toys then use the
stand-in shapes that `visuals.ts` builds and paints (`bodyGeometry` / `paintBody`), and `scripts/check-dist.mjs` must be told (`SHIPPED_MODELS`).

| Toy | File | Original | Packed |
|---|---|---|---|
| 모닝빵 (S02) | `bread.glb` | 1.34 MB, 3771 vertices, one 4096-px PNG | 211 KB, one 1024-px JPEG |
| 찹쌀떡 (S03) | `peachmochi.glb` | 8.33 MB, 3575 vertices, three PNG textures | 301 KB, one 1024-px JPEG |

Changes made: only the first mesh and its base-colour texture are kept (the game reads nothing else), the node transform is baked into the
positions, the texture is shrunk to at most 1024 px and stored as JPEG; no normals (the game recomputes them). Exact sizes, hashes and the
permission record per file: `models.json`. Packed by `scripts/fidgets/pack-reference-models.mjs`.
