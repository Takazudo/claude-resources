#!/usr/bin/env python3
"""Run a reference snapshot's pure unit tests in a disposable copy, normal and -O.

A fail-loud `docker` shim is placed first on PATH: if any test reaches a native
entrypoint, the shim records it and the run fails. Nothing is dispatched.
Usage: run_reference_tests.py [SNAPSHOT_DIR]   (default: reference/current)
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

DEFAULT = Path(__file__).resolve().parents[1] / 'reference' / 'current'


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    source = Path(argv[0]).resolve() if argv else DEFAULT
    results = []
    with tempfile.TemporaryDirectory(prefix='kicad-actions-tests-') as scratch:
        copy = Path(scratch) / 'snapshot'
        shutil.copytree(source, copy, ignore=shutil.ignore_patterns('__pycache__'))
        guard = Path(scratch) / 'guard'
        guard.mkdir()
        marker = guard / 'native-call'
        shim = guard / 'docker'
        shim.write_text(f'#!/bin/sh\necho "$@" >> "{marker}"\nexit 97\n')
        shim.chmod(0o700)
        env = {'PATH': f'{guard}{os.pathsep}{os.environ.get("PATH", "")}', 'HOME': scratch,
               'LANG': os.environ.get('LANG', 'C.UTF-8'), 'PYTHONDONTWRITEBYTECODE': '1'}
        for flags in ([], ['-O']):
            argv_ = [sys.executable, '-B', *flags, '-m', 'unittest', 'discover', '-s', 'scripts/ci', '-p', 'test_osc*.py']
            p = subprocess.run(argv_, cwd=copy, env=env, capture_output=True, text=True, timeout=120)
            tail = p.stderr.strip().splitlines()[-3:]
            results.append({'flags': flags, 'exit_code': p.returncode, 'summary': tail})
        native = marker.read_text().splitlines() if marker.exists() else []
    ok = all(r['exit_code'] == 0 for r in results) and not native
    print(json.dumps({'snapshot': str(source), 'verdict': 'PASS' if ok else 'FAIL', 'runs': results,
                      'native_calls_blocked': native}, indent=2))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
