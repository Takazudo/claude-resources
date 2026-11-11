# Bambu 3MF editing notes

## Contents

- Scope and members
- Object representation and ID meanings
- Transforms
- Invalidation and preservation
- Sources

## Scope and members

3MF is a ZIP/XML package. Bambu projects add application settings and plate/object
metadata. A generic CAD-exported 3MF does not automatically include those settings.
This helper implements new single-plate projects from an empty Studio template,
and settings-only patches. It is not a complete parser/editor for every current
or future Bambu project feature.

| Member | Role |
| --- | --- |
| `[Content_Types].xml` | Package content-type declarations |
| `_rels/.rels` | Root model and thumbnail relationships |
| `3D/3dmodel.model` | Resources, components, build items and model metadata |
| `Metadata/project_settings.config` | Full JSON configuration; copy raw bytes by default |
| `Metadata/model_settings.config` | XML object/part settings, plate membership and assembly placement |
| `Metadata/slice_info.config` | Slicing metadata; omitted in newly generated unsliced output |
| `Metadata/filament_sequence.json` | Computed sequences/mappings; invalidate after relevant changes |

Other projects may split meshes into `3D/Objects/*.model` with production-extension
paths and relationship files. Preserve that structure during settings-only edits.
Keep source/assembly data such as `assembly_tree.json`, `assembly_step.json`,
`assembly_model.json`, SVG/source files and unknown members.

## Object representation

Use a mesh resource plus an enclosing component object for each separate part:

```xml
<resources>
  <object id="1" type="model"><mesh>...</mesh></object>
  <object id="2" type="model">
    <components>
      <component objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>
    </components>
  </object>
</resources>
<build>
  <item objectid="2" transform="1 0 0 0 1 0 0 0 1 155 140 0" printable="1"/>
</build>
```

Keep core/production namespace declarations. The generator assigns unique
production `p:UUID` attributes to objects, components, build and build items.
Names above are schematic: actual model XML tags use the 3MF core namespace.

Corresponding object settings:

```xml
<object id="2">
  <metadata key="name" value="Spacer"/>
  <metadata key="extruder" value="1"/>
  <part id="1" subtype="normal_part">
    <metadata key="name" value="Spacer"/>
    <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>
  </part>
</object>
```

Plate membership:

```xml
<model_instance>
  <metadata key="object_id" value="2"/>
  <metadata key="instance_id" value="0"/>
  <metadata key="identify_id" value="1"/>
</model_instance>
```

Put that element inside the existing plate. Match it with an `assemble_item`
inside `assemble`, using the same object/instance IDs and 12-number transform.

`instance_id` is zero-based within each object. Separate objects with one
instance each all use `instance_id=0`; do not increment it globally.
`identify_id` should be unique for each instance. `extruder` in object settings
selects a filament slot, not a direct physical-nozzle selection.

## Transforms

A 3MF 12-number transform `a b c d e f g h i tx ty tz` means:

```text
x' = a*x + d*y + g*z + tx
y' = b*x + e*y + h*z + ty
z' = c*x + f*y + i*z + tz
```

Part metadata `matrix` is instead a 16-number 4x4 row-major matrix. Keep component
and part matrices identity in newly generated simple projects. Bake orientation
into vertices and apply plate translation only once in the build instance.

## Invalidation and preservation

After geometry or process edits, strip old generated toolpaths and slice results.
Remove stale per-plate `gcode_file`, checksum, pattern and slice-result references.
Remove generated `Metadata/plate_N.json` pattern caches. After geometry edits,
also remove known empty/stale plate/top/pick images and their relationships; do
not remove arbitrary design images. Remove content-type overrides for deleted
members. Unused extension-level Default declarations are harmless.

Keep every `.model` member byte-for-byte for settings-only changes. Keep painting,
support/seam data, source paths, transforms and object/part overrides. Inspect
overrides before claiming a global process setting is effective for all objects.
Print settings frequently use strings and arrays of strings. The H2D's arrays
can use different filament/nozzle/variant indexing schemes; do not assume every
array has one entry per filament.

An empty-template generator does not need to support all those features. Refuse
nonempty input in `create` instead of erasing it. When extending general editing,
inspect the current Studio source and validate the actual modified file in Studio.

## Sources

Verified 2026-09-27:

- [Bambu importer/exporter](https://github.com/bambulab/BambuStudio/blob/master/src/libslic3r/Format/bbs_3mf.cpp)
- [Bambu format member paths](https://github.com/bambulab/BambuStudio/blob/master/src/libslic3r/Format/bbs_3mf.hpp)
- [Bambu model volume types](https://github.com/bambulab/BambuStudio/blob/master/src/libslic3r/Model.cpp)
- [3MF core specification](https://github.com/3MFConsortium/spec_core/blob/master/3MF%20Core%20Specification.md)
