# Included personal H2D template

Source: user-provided `h2d-empty.3mf`, inspected 2026-09-27 (Japan).
The bundled file is an unchanged copy of that upload.

| Field | Saved value |
| --- | --- |
| Studio producer | `BambuStudio-02.08.02.61` |
| Printer | `Bambu Lab H2D` |
| Printer preset | `Bambu Lab H2D 0.6 nozzle` |
| Nozzle diameters | `["0.6", "0.6"]` mm |
| Process | `0.24mm Balanced Strength @BBL H2D 0.6 nozzle` |
| Layer / first layer | 0.24 / 0.30 mm |
| Bed | Internal setting `High Temp Plate` |
| Filament slot 1 | `Bambu PLA Basic @BBL H2D 0.6 nozzle`, color `#161616` |
| Filament slot 2 | `Generic PLA @BBL H2D`, color `#898989` |
| Walls / infill | 2 / 15% |
| Support enabled | No |
| Brim type | `auto_brim` |
| Print sequence | `by layer` |
| Overall bed | X 0–350, Y 0–320 mm |
| Saved extruder area 1 | X 0–325, Y 0–320 mm; height 320 mm |
| Saved extruder area 2 | X 25–350, Y 0–320 mm; height 325 mm |
| Common area used by helper | X 25–325, Y 0–320 mm; height 320 mm |
| Wrapping exclusion | X 145–256, Y 310–326 mm |

The configuration has 580 keys, including full printer start/end/change code and
filament/extruder variant arrays. Its project-settings member is 73,452 bytes.
Expected SHA-256 for that member:

```text
99b34023dcf3d8142abb119f426ca54d499a4d07026c7e406e2b062147c7a356
```

The model resources and build are empty; there is exactly one plate. Existing
thumbnails show an empty plate and are removed when geometry is inserted. Studio
can regenerate the previews when it opens/saves the project.

Filament slots are not physical nozzles or current AMS inventory. The template's
filament and nozzle mapping values are preserved. Keep the slot number separate
from the physical nozzle's reach. Profile names describe saved choices, not a
live connection to the printer or a measurement of loaded material.

Use a new empty project saved in Studio when the user's normal hardware/material
setup changes. Pass it with `--template`; there is no need to rewrite the skill.
For a shared or public version, use the intended recipients' own template instead
of assuming this personal setup.
