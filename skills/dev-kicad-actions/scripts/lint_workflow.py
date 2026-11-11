#!/usr/bin/env python3
"""Static check of a KiCad Actions workflow against the artifact-only contract. Never runs it.

Usage: lint_workflow.py WORKFLOW [--max-job-minutes 20] [--max-retention-days 7]
Exit codes: 0 = no findings, 1 = findings, 2 = unreadable workflow.
"""
import argparse
import json
import re
import sys
from pathlib import Path

SHA = re.compile(r'[0-9a-f]{40}')
FORBIDDEN = ['contents: write', 'secrets.', 'git push', 'workflow_run', 'actions/cache', 'pickle', 'max-parallel']


def load(path):
    text = Path(path).read_text()
    try:
        return text, json.loads(text)
    except json.JSONDecodeError:
        pass
    try:
        import yaml
    except ImportError:
        raise ValueError('not JSON and PyYAML is unavailable')
    data = yaml.safe_load(text)
    if True in data and 'on' not in data:  # YAML 1.1 parses a bare `on:` key as boolean true
        data['on'] = data.pop(True)
    return text, data


def lint(text, w, max_job_minutes=20, max_retention_days=7):
    findings = []
    def need(ok, message):
        if not ok:
            findings.append(message)
    for word in FORBIDDEN:
        need(word not in text, f'forbidden content: {word!r}')
    triggers = w.get('on')
    need(triggers == 'workflow_dispatch' or (isinstance(triggers, dict) and set(triggers) == {'workflow_dispatch'})
         or triggers == ['workflow_dispatch'], 'trigger must be workflow_dispatch only')
    need(w.get('permissions') == {'contents': 'read'}, 'permissions must be exactly {contents: read}')
    conc = w.get('concurrency') or {}
    need(isinstance(conc, dict) and conc.get('cancel-in-progress') is False, 'concurrency.cancel-in-progress must be false')
    need(isinstance(conc, dict) and bool(SHA.search(str(conc.get('group', '')))), 'concurrency group must name an immutable 40-hex identity')
    jobs = w.get('jobs') or {}
    need(len(jobs) == 1, f'expected exactly one job, found {len(jobs)}')
    for name, job in jobs.items():
        runs_on = job.get('runs-on')
        need(isinstance(runs_on, str) and 'self-hosted' not in runs_on and '${{' not in runs_on,
             f'{name}: runs-on must be a fixed GitHub-hosted label')
        need('strategy' not in job, f'{name}: matrix/strategy is not allowed (one worker)')
        timeout = job.get('timeout-minutes')
        need(isinstance(timeout, int) and timeout <= max_job_minutes, f'{name}: job timeout-minutes must be <= {max_job_minutes}')
        steps = job.get('steps', [])
        step_timeouts = [s.get('timeout-minutes') for s in steps]
        need(all(isinstance(t, int) for t in step_timeouts), f'{name}: every step needs timeout-minutes')
        if isinstance(timeout, int) and all(isinstance(t, int) for t in step_timeouts):
            need(sum(step_timeouts) <= timeout, f'{name}: step timeouts sum {sum(step_timeouts)} exceeds job {timeout}')
        for i, step in enumerate(steps):
            label = f'{name}: step {i} ({step.get("name") or step.get("uses")})'
            uses = step.get('uses')
            if uses and not uses.startswith('./'):
                need(bool(SHA.fullmatch(uses.rsplit('@', 1)[-1])) if '@' in uses else False, f'{label}: action must be pinned to a commit SHA')
            run = step.get('run', '')
            need('${{ inputs.' not in run and '${{ github.event.inputs' not in run,
                 f'{label}: pass inputs through env, not ${{{{ }}}} inside run')
            with_ = step.get('with') or {}
            if uses and uses.startswith('actions/checkout@'):
                need(with_.get('persist-credentials') is False, f'{label}: persist-credentials must be false')
                ref = str(with_.get('ref', ''))
                need(ref == '${{ github.workflow_sha }}' or bool(SHA.fullmatch(ref)), f'{label}: checkout ref must be immutable')
            if uses and uses.startswith('actions/upload-artifact@'):
                retention = with_.get('retention-days')
                need(isinstance(retention, int) and retention <= max_retention_days, f'{label}: retention-days must be <= {max_retention_days}')
                need(with_.get('if-no-files-found') == 'error', f'{label}: if-no-files-found must be error')
                paths = [p.strip() for p in str(with_.get('path', '')).splitlines() if p.strip()]
                need(bool(paths) and not any(p in ('.', './', '*') or '*' in p for p in paths),
                     f'{label}: upload explicit files only, no workspace or globs')
    return findings


def main(argv=None):
    a = argparse.ArgumentParser(description=__doc__)
    a.add_argument('workflow')
    a.add_argument('--max-job-minutes', type=int, default=20)
    a.add_argument('--max-retention-days', type=int, default=7)
    args = a.parse_args(argv)
    try:
        text, data = load(args.workflow)
    except (OSError, ValueError) as exc:
        print(json.dumps({'verdict': 'UNKNOWN', 'error': str(exc)}))
        return 2
    findings = lint(text, data, args.max_job_minutes, args.max_retention_days)
    print(json.dumps({'verdict': 'FAIL' if findings else 'PASS', 'findings': findings}, indent=2))
    return 1 if findings else 0


if __name__ == '__main__':
    sys.exit(main())
