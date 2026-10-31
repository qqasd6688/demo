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

Downloaded on 2026-10-31. Original download URLs, byte lengths and MD5 checksums
are recorded in `sources.json`. Run `node scripts/materials.mjs` from the
work directory to retrieve and verify the same inputs. The page loads only these
local files; it makes no runtime requests to Poly Haven.

The scan of exposed coral ground is used as limestone and rubble microtexture.
Living coral shapes, relief, colors, and shadows are authored procedurally by this
project; the scan does not provide a living reef model.
