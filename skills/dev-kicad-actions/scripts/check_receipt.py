#!/usr/bin/env python3
"""Offline review of a KiCad Actions run receipt. Never dispatches, downloads or starts KiCad.

Exit codes: 0 = PASS within the mode's scope, 1 = FAIL, 2 = UNKNOWN (evidence missing).
"""
import argparse
import importlib.util
import json
import re
import sys
from pathlib import Path

HEX40 = re.compile(r'[0-9a-f]{40}')
IMAGE = re.compile(r'[^@\s]+@sha256:[0-9a-f]{64}')
NOT_JUDGED = ('connectivity', 'drc', 'electrical', 'assembly', 'manufacturing')


def load_json(path):
    return None if path is None else json.loads(Path(path).read_text())


def validate_config(config, mode):
    problems = []
    if mode not in config.get('modes', {}):
        problems.append(f'mode {mode!r} not configured')
    if not HEX40.fullmatch(str(config.get('source_sha'))):
        problems.append('source_sha must be a 40-hex commit')
    if config.get('tooling_sha') is not None and not HEX40.fullmatch(str(config['tooling_sha'])):
        problems.append('tooling_sha must be null or a 40-hex commit')
    if not IMAGE.fullmatch(str(config.get('image'))):
        problems.append('image must be pinned by sha256 digest')
    pins = {**config.get('pins', {}), **config.get('modes', {}).get(mode, {}).get('extra_pins', {})}
    if not pins or any(not re.fullmatch(r'[0-9a-f]{64}', str(v)) for v in pins.values()):
        problems.append('pins must map paths to sha256 values')
    if '<' in json.dumps(config):
        problems.append('config still contains <placeholders>')
    return problems


class Review:
    def __init__(self):
        self.checks = {}

    def add(self, name, state, detail=''):
        self.checks[name] = {'state': state, 'detail': detail}

    def expect(self, name, ok, detail=''):
        self.add(name, 'PASS' if ok else 'FAIL', detail)

    def verdict(self):
        states = {c['state'] for c in self.checks.values()}
        return 'FAIL' if 'FAIL' in states else 'UNKNOWN' if 'UNKNOWN' in states else 'PASS'


def clean_result(row):
    return row.get('failure') is None and row.get('exit_code') == 0


def review_receipt(r, config, mode, receipt):
    spec = config['modes'][mode]
    for key in ('error', 'cleanup_error', 'after_error'):
        if key in receipt:
            r.add('first_failure', 'FAIL', f'{key}: {receipt[key]} (preserve this receipt; do not rerun unchanged)')
            break
    r.expect('receipt_status', receipt.get('status') == spec['expected_status'], str(receipt.get('status')))
    r.expect('source_sha', receipt.get('source_sha') == config['source_sha'], str(receipt.get('source_sha')))
    tooling = str(receipt.get('tooling_sha'))
    r.expect('tooling_sha', bool(HEX40.fullmatch(tooling)) and config.get('tooling_sha') in (None, tooling), tooling)
    r.expect('image', receipt.get('image') == config['image'], str(receipt.get('image')))
    r.expect('candidate_ingestion_unclaimed', receipt.get('candidate_ingestion') == 'UNIMPLEMENTED',
             str(receipt.get('candidate_ingestion')))
    pins = {**config['pins'], **spec.get('extra_pins', {})}
    for phase in ('before', 'after'):
        if phase not in receipt:
            r.add(f'inputs_{phase}', 'UNKNOWN', 'snapshot missing')
        else:
            r.expect(f'inputs_{phase}', receipt[phase] == pins, 'allowlisted input hashes')
    commands = receipt.get('commands', [])
    for n, command in enumerate(config['version_commands']):
        rows = [row for row in commands if row.get('argv') == command]
        ok = len(rows) == 1 and clean_result(rows[0]) and rows[0].get('output', '').strip() == config['kicad_version']
        r.expect(f'version_{n}', ok, repr(rows[0].get('output', '').strip()) if rows else 'command not recorded')
    prefix = config['wrapper_prefix']
    wrapped = [row for row in commands if row.get('argv', [])[:len(prefix)] == prefix]
    r.expect('wrapper_commands', len(wrapped) == spec['wrapper_commands'] and all(map(clean_result, wrapped)),
             f'{len(wrapped)} recorded, {spec["wrapper_commands"]} expected')
    cleanup = receipt.get('cleanup', [])
    expected = config['containers_per_command'] * spec['wrapper_commands']
    normal = all(row.get('status') == 'REMOVED_CONFIRMED'
                 and (row.get('state_before_cleanup') or {}).get('Running') is False
                 and (row.get('state_before_cleanup') or {}).get('ExitCode') == 0 for row in cleanup)
    r.expect('owned_containers_removed', len(cleanup) == expected and normal,
             f'{len(cleanup)} records, {expected} expected; ABSENT or running is not proof of normal exit')


def review_inventory(r, config, inventory, validator):
    spec = config['modes']['identity']
    if inventory is None:
        r.add('inventory', 'UNKNOWN', 'inventory.json not read')
        return
    board_hash = next(iter(spec['extra_pins'].values()))
    pads = inventory.get('pads', [])
    keys = [f"{p.get('ref')}.{p.get('number')}" for p in pads]
    r.expect('inventory_status', inventory.get('status') == spec['inventory_status'], str(inventory.get('status')))
    r.expect('inventory_board_unchanged', inventory.get('before') == board_hash == inventory.get('after'))
    r.expect('inventory_version', inventory.get('version') == config['kicad_version'], str(inventory.get('version')))
    r.expect('pad_count', len(pads) == spec['expected_pad_count'] and len(set(keys)) == len(keys),
             f'{len(pads)} pads, {len(set(keys))} unique, {spec["expected_pad_count"]} expected')
    refs = {p.get('ref') for p in pads}
    r.expect('ref_count', len(refs) == spec['expected_ref_count'], f'{len(refs)} refs')
    uuids = [p.get('uuid') for p in pads]
    r.expect('pad_uuid_unique', all(uuids) and len(set(uuids)) == len(uuids))
    r.expect('no_board_acceptance_claim', inventory.get('board_acceptance') is False)
    if validator:
        spec_ = importlib.util.spec_from_file_location('identity_validator', validator)
        module = importlib.util.module_from_spec(spec_)
        spec_.loader.exec_module(module)
        try:
            module.validate(pads)
            r.add('exact_identity', 'PASS', f'independently re-validated with {Path(validator).name}')
        except ValueError as exc:
            r.add('exact_identity', 'FAIL', str(exc))
    else:
        r.add('exact_identity', 'UNKNOWN', 'counts only; pass --identity-validator for exact re-validation')


def evaluate(config, mode, run_status, receipt=None, inventory=None, tests=None, validator=None):
    problems = validate_config(config, mode)
    if problems:
        return {'mode': mode, 'verdict': 'UNKNOWN', 'config_problems': problems}
    r = Review()
    r.add('run_status', {'success': 'PASS', 'failure': 'FAIL'}.get(run_status, 'UNKNOWN'), run_status)
    if receipt is None:
        r.add('receipt', 'UNKNOWN', 'artifact unread: run status alone is not validation')
    else:
        review_receipt(r, config, mode, receipt)
    if tests is None:
        r.add('pure_tests', 'UNKNOWN', 'tests.json not read')
    else:
        r.expect('pure_tests', len(tests) == 2 and all(map(clean_result, tests)), 'normal and -O runs')
    if mode == 'identity':
        review_inventory(r, config, inventory, validator)
    verdict = r.verdict()
    dimensions = {'version_probe': verdict, 'identity': verdict if mode == 'identity' else 'NOT_EVALUATED'}
    dimensions.update({d: 'NOT_EVALUATED' for d in NOT_JUDGED})
    if verdict == 'FAIL':
        action = 'Preserve the first failing receipt; change only the input that caused it, review, then re-verify. No unchanged rerun.'
    elif verdict == 'UNKNOWN':
        action = 'Read the missing evidence by an authorized route. If access is denied, record it and report the limit; do not bypass.'
    else:
        action = f'PASS covers {mode} only. Adoption still needs independent review and owner authority.'
    return {'mode': mode, 'verdict': verdict, 'checks': r.checks, 'dimensions': dimensions,
            'adoption': 'OWNER_DECISION_REQUIRED', 'next_action': action}


def main(argv=None):
    a = argparse.ArgumentParser(description=__doc__)
    a.add_argument('--config', required=True)
    a.add_argument('--mode', required=True)
    a.add_argument('--run-status', required=True, choices=['success', 'failure', 'pending', 'uncertain'])
    a.add_argument('--receipt')
    a.add_argument('--inventory')
    a.add_argument('--tests')
    a.add_argument('--identity-validator', help='reviewed module exposing validate(pads)')
    args = a.parse_args(argv)
    result = evaluate(load_json(args.config), args.mode, args.run_status, load_json(args.receipt),
                      load_json(args.inventory), load_json(args.tests), args.identity_validator)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return {'PASS': 0, 'FAIL': 1}.get(result['verdict'], 2)


if __name__ == '__main__':
    sys.exit(main())
