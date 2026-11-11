# Bambu Studio CLI

## Installation and discovery

The CLI is a mode of the desktop application executable, not a separate package.
For a normal Mac installation:

```bash
"/Applications/BambuStudio.app/Contents/MacOS/BambuStudio" --help
```

The app's location may differ. `scripts/studio_cli.py` checks standard application
locations and the macOS bundle's `CFBundleExecutable`, then PATH. It accepts
`--path` or `BAMBU_STUDIO_BIN` for an explicit executable. It only discovers the
executable; it does not launch Studio. On Windows the executable is normally
`bambu-studio.exe` in the installation folder; on Linux it is `bambu-studio` or an
AppImage/package wrapper. Verify the actual local `--help`.

Direct project generation and structural validation need only Python 3.10+.
If Bambu Studio is missing from the agent's environment, finish the unsliced
project and state that local Studio verification remains.

## Re-open and export an unsliced project

After discovery, set `BAMBU_STUDIO_BIN` to the actual executable path. Check that
the output does not already exist. Use quoted paths:

```bash
"$BAMBU_STUDIO_BIN" --help
"$BAMBU_STUDIO_BIN" --arrange 0 \
  --export-3mf ./output/part.studio-checked.3mf \
  ./output/part.generated.3mf
```

Record stdout, stderr and exit code. Ensure the file exists, inspect its settings
and model count, and compare it with the generated project. This is a stronger
compatibility check than parsing the ZIP, but does not establish print quality.
CLI behavior is version-dependent; trust the installed executable's help and
actual results.

Do not substitute macOS `open -a` for this command: launching the GUI is different
from invoking the executable's command-line options.

## Optional local slice check

```bash
"$BAMBU_STUDIO_BIN" --arrange 0 --slice 1 \
  --export-3mf ./output/part.sliced.3mf \
  ./output/part.generated.3mf
```

`--slice 1` selects plate 1; `--slice 0` selects all plates. Preserve the unsliced
project separately. A `.3mf` filename alone does not establish whether it
contains G-code; inspect the archive. Exporting a file is not sending a job to a
printer. A physical print requires the user's explicit instruction.

Check slice warnings, support/brim/prime-tower space, thin features, toolhead
clearance and selected filament/nozzle configuration. For the H2D's wider bed,
use an explicitly selected nozzle/configuration and Studio's own checks rather
than extending the helper's conservative common-area rule by guesswork.

## Preserve configuration

- Use embedded project settings by default.
- Do not add `--uptodate` casually: it explicitly updates configuration values.
- Do not use `--orient` or auto-arrangement when the intended orientation/position
  is already encoded. Use `--arrange 0` for a preservation check.
- `--load-settings` and `--load-filaments` require full resolved configurations;
  raw inherited presets from `resources/profiles` are insufficient.
- The user's template was saved with Studio `02.08.02.61`. A local older version
  may reject a newer project. Do not fake the producer version or force a newer
  file override to hide a compatibility problem; use a compatible Studio build.
- A Studio roundtrip may normalize settings and metadata. Compare semantic values
  before making it the final deliverable, and disclose relevant differences.

## Sources

Verified 2026-09-27:

- [Official CLI usage](https://github.com/bambulab/BambuStudio/wiki/Command-Line-Usage)
- [Executable build names](https://github.com/bambulab/BambuStudio/blob/master/src/CMakeLists.txt)
- [macOS bundle metadata](https://github.com/bambulab/BambuStudio/blob/master/src/platform/osx/Info.plist.in)
- [Application entry point and CLI export](https://github.com/bambulab/BambuStudio/blob/master/src/BambuStudio.cpp)
