#!/usr/bin/env python3
"""Find the locally installed Bambu Studio executable. Never invoke it implicitly."""
import argparse
import json
import os
from pathlib import Path
import plistlib
import shutil
import sys


def candidates(explicit=None):
    if explicit:
        yield Path(explicit).expanduser()
        return
    if os.environ.get('BAMBU_STUDIO_BIN'):
        yield Path(os.environ['BAMBU_STUDIO_BIN']).expanduser()
        return
    if sys.platform == 'darwin':
        for base in (Path('/Applications'), Path.home() / 'Applications'):
            for app in (base/'BambuStudio.app', base/'Bambu Studio.app'):
                plist = app/'Contents'/'Info.plist'
                if plist.is_file():
                    try:
                        executable = plistlib.loads(plist.read_bytes()).get('CFBundleExecutable','BambuStudio')
                        yield app/'Contents'/'MacOS'/executable
                    except (ValueError, OSError):
                        pass
                yield app/'Contents'/'MacOS'/'BambuStudio'
    if sys.platform == 'win32':
        for key in ('ProgramFiles','ProgramFiles(x86)','LOCALAPPDATA'):
            if os.environ.get(key):
                for folder in ('Bambu Studio','BambuStudio'):
                    yield Path(os.environ[key])/folder/'bambu-studio.exe'
    for name in ('bambu-studio','BambuStudio','bambu-studio.exe'):
        found = shutil.which(name)
        if found:
            yield Path(found)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--path', help='An explicit Bambu Studio executable or AppImage.')
    args = p.parse_args()
    checked = []
    for candidate in candidates(args.path):
        if str(candidate) in checked:
            continue
        checked.append(str(candidate))
        if candidate.is_file() and (sys.platform == 'win32' or os.access(candidate,os.X_OK)):
            print(json.dumps({'found':True,'executable':str(candidate.resolve()),
                'next_check':[str(candidate.resolve()),'--help'],
                'note':'CLI is bundled with the desktop application. This helper has not run it.'},indent=2))
            return 0
    print(json.dumps({'found':False,'checked':checked,
        'note':'Creating and structurally checking unsliced 3MF projects still works. '
               'For local Studio validation, set BAMBU_STUDIO_BIN to the application executable.'},indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
