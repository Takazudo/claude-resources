# Project manifest

## Contents

- Manifest fields
- Coordinates and placement
- Mesh JSON
- Settings supported by the helper
- CAD export approach
- Direct mesh example

## Manifest fields

Use schema version 1. Resolve mesh file paths relative to the manifest file.
Use fresh output names; helpers refuse to overwrite a template or existing output.

```json
{
  "schema_version": 1,
  "title": "Case spacers — revision 1",
  "description": "Nominal dimensions; fit has not been calibrated.",
  "margin_mm": 10,
  "gap_mm": 6,
  "objects": [
    {
      "name": "Spacer A",
      "mesh": "spacer.mesh.json",
      "filament": 1,
      "position_mm": [155, 140],
      "rotate_z_degrees": 0,
      "settings": {"wall_loops": "3"}
    },
    {
      "name": "Spacer B",
      "mesh": "spacer.mesh.json",
      "filament": 1
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `schema_version` | Required integer `1` |
| `title`, `description` | Optional strings written into model metadata |
| `objects` | Required nonempty list of independent printable solids |
| `margin_mm` | Margin within the common nozzle area; default 10 |
| `gap_mm` | Minimum distance between object bounding rectangles; default 6 |
| Top-level `settings` | Optional allowlisted global process changes, represented as strings |
| Object `name` | Human-readable part name |
| Object `mesh` | Mesh JSON path, STL path, or inline JSON mesh object |
| Object `filament` | 1-based filament slot; defaults to 1 |
| Object `position_mm` | Optional `[X,Y]` of the rotated object's lower-left bounding corner |
| Object `rotate_z_degrees` | Optional in-plane rotation applied before normalization |
| Object `settings` | Optional allowlisted per-object process changes |

## Coordinates and placement

All vertices are in millimeters. The helper first rotates around Z, then normalizes
the resulting mesh to minimum X=0, Y=0, Z=0. It places that normalized object at
`position_mm`. Therefore `position_mm` is not its center and source mesh
translation is not retained. Preserve assembly alignment in CAD when generating
one joined solid. Do not use this simple object generator for a multipart color
assembly whose parts must keep relative positions.

When position is absent, a deterministic shelf search places the object's bounding
rectangle among the explicit positions. Explicit positions are reserved first.
It checks the saved rectangular nozzle-area intersection and saved bed/wrapping
exclusions. An unsupported nonrectangular bed fails with an explanation.

This helper does not pack multiple plates or allow objects to intersect. It refuses
sequential `by object` printing because the head clearance requires slicer analysis.
For mixed materials, large brims/supports or a prime tower, use Studio to verify
space after slicing. No material-change waste estimate is calculated here.

## Mesh JSON

```json
{
  "vertices": [[0,0,0],[1,0,0],[0,1,0],[0,0,1]],
  "triangles": [[0,2,1],[0,1,3],[1,2,3],[2,0,3]]
}
```

Triangles use zero-based vertex indices. Each geometric boundary edge must have
two incident triangles with opposite directed winding. Vertex coordinates must
be finite and triangles must have nonzero area. Use outward winding and a closed
solid with positive signed volume. Identical vertices from separate CAD faces
must be welded consistently before exporting mesh JSON; the STL reader welds
identical coordinate tuples automatically.

The check does not prove the absence of triangle self-intersections or point-only
nonmanifold connections. Check the CAD solid and actual slice before claiming
manufacturability. Mesh validation is also not a minimum-wall-thickness check.

## Settings supported by the helper

Use string values throughout; booleans are `"0"`/`"1"`, not JSON booleans.

- Integers: `wall_loops`, `top_shell_layers`, `bottom_shell_layers`, `skirt_loops`.
- Numbers: `layer_height`, `initial_layer_print_height`, `brim_width`,
  `brim_object_gap`, `support_threshold_angle`.
- Booleans: `enable_support`, `support_on_build_plate_only`.
- Percentage: `sparse_infill_density`, such as `"25%"`.
- Enums: `sparse_infill_pattern`, `brim_type`, `support_type`, `seam_position`.

The script contains the explicit permitted enum values and bounds. Unsupported
settings fail rather than silently being ignored. Settings must exist in the
template configuration. For nozzle limits, layer-height overrides are checked
against the smallest saved maximum layer height. These are basic checks, not a
replacement for Studio's complete process validation.

For no global overrides, `Metadata/project_settings.config` is copied byte for
byte. Object-level overrides do not alter that file. With global overrides, only
the requested semantic values change; JSON whitespace can change.

## CAD export approach

Use the repository's existing CAD toolchain. With CadQuery, use the shape's
`tessellate(tolerance, angularTolerance)` API, collect vertex coordinates and
triangle indices, weld coincident vertices carefully, and write the mesh JSON.
Retain the original `.py` source and export STEP when engineering edits are
expected. Consult the installed version's API rather than assuming a library
version. For OpenSCAD, an internal STL export is supported by `mesh`; the user
still receives the final configured 3MF project.

For geometry simple enough to describe directly, `make_spacer_example.py` is a
complete standard-library mesh generator with outward triangle winding. It
generates nominal geometry before printer/material tolerance compensation.

## Direct mesh example

For two nominal Ø16 × 4 mm spacers with Ø4.2 mm through-holes, generate mesh JSON
and a manifest, then package the configured project:

```bash
python3 "$SKILL_DIR/scripts/make_spacer_example.py" --output-dir ./design/spacer-example
python3 "$SKILL_DIR/scripts/bambu_3mf.py" create \
  --manifest ./design/spacer-example/spacers.manifest.json \
  --output ./output/spacers-r01.3mf
```

Expect two separately named objects resting on Z=0, no toolpaths, and unchanged
global template settings. Retain the generator and manifest for dimensional
revisions. These are nominal dimensions; apply fit compensation only from the
user's requirements or calibration.
