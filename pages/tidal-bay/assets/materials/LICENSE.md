# Scan material credits

These five files are unchanged texture maps by **Rob Tuytel**, provided by
[Poly Haven](https://polyhaven.com/) under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
Poly Haven's asset licensing is documented at <https://polyhaven.com/license>.

| Local file | Source asset | Map |
| --- | --- | --- |
| coral-albedo.jpg | [Coral Ground 02](https://polyhaven.com/a/coral_ground_02) | Diffuse, 2K |
| coral-normal.jpg | Coral Ground 02 | OpenGL normal, 1K |
| coral-height.jpg | Coral Ground 02 | Displacement, 1K |
| sand-albedo.jpg | [Coast Sand 01](https://polyhaven.com/a/coast_sand_01) | Diffuse, 1K |
| sand-normal.jpg | Coast Sand 01 | OpenGL normal, 1K |

The [source manifest](./sources.json) records the original download URLs, byte lengths and MD5 checksums for the files acquired on 2026-10-31. At startup, the bay worker decodes the local images and bakes them into the coast and reef textures. [Local image loader](../materials.js)

For maintainers with a source checkout, run `node scripts/materials.mjs` from `pages/tidal-bay/` to check local files against the Poly Haven API, download missing or mismatched files, and regenerate the manifest. Normal playback uses the five local JPEGs.

The scan of exposed coral ground is used as limestone and rubble microtexture.
Living coral shapes, relief, colors, and shadows are authored procedurally by this
project; the scan does not provide a living reef model.
