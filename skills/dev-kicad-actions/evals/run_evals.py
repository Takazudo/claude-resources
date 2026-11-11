#!/usr/bin/env python3
"""Offline evaluation of dev-kicad-actions: positive/negative scenarios from scenarios.md.

Receipts here are SYNTHETIC, built from the OSC example config; they are not real run receipts.
No dispatch, download, Docker or native KiCad is used.
"""
import copy
import importlib.util
import json
from pathlib import Path
import sys

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / 'scripts'))
import check_receipt  # noqa: E402
import lint_workflow  # noqa: E402

CONFIG = json.loads((SKILL / 'templates/osc-hole-field.config.json').read_text())
VALIDATOR = SKILL / 'reference/current/scripts/ci/osc_frozen_board_inventory.py'
WORKFLOW = SKILL / 'reference/current/.github/workflows/osc-candidate-check.yml'
TOOLING = 'a133464c16237a9f423477612b46a71b62f071b5'


def container(n):
    return {'name': f'osc-smoke-{n:032x}', 'cid': f'{n:064x}', 'status': 'REMOVED_CONFIRMED',
            'state_before_cleanup': {'Running': False, 'ExitCode': 0}}


def ok(argv, output):
    return {'argv': argv, 'exit_code': 0, 'failure': None, 'elapsed_seconds': 1.0, 'output': output}


def receipt(mode):
    spec = CONFIG['modes'][mode]
    commands = [ok(['git', 'rev-parse', 'HEAD'], CONFIG['source_sha'] + '\n'),
                ok(['docker', 'pull', CONFIG['image']], 'pulled\n')]
    commands += [ok(c, CONFIG['kicad_version'] + '\n') for c in CONFIG['version_commands']]
    if mode == 'identity':
        commands.append(ok(CONFIG['wrapper_prefix'] + ['python3', '-B', '/inventory.py'], '{}'))
    pins = {**CONFIG['pins'], **spec.get('extra_pins', {})}
    total = CONFIG['containers_per_command'] * spec['wrapper_commands']
    return {'status': spec['expected_status'], 'source_sha': CONFIG['source_sha'], 'tooling_sha': TOOLING,
            'image': CONFIG['image'], 'candidate_ingestion': 'UNIMPLEMENTED', 'commands': commands,
            'before': dict(pins), 'after': dict(pins), 'cleanup': [container(i + 1) for i in range(total)]}


def inventory():
    spec = importlib.util.spec_from_file_location('inv', VALIDATOR)
    inv = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(inv)
    pads = [dict(ref=k.split('.')[0], number=k.split('.')[1], uuid=v['uuid'], net=v['net'], x_nm=0, y_nm=0,
                 layer='F.Cu', orientation_deg=0, flipped=False) for k, v in sorted(inv.EXPECTED.items())]
    board = next(iter(CONFIG['modes']['identity']['extra_pins'].values()))
    return {'status': 'IDENTITY_ONLY_CONNECTIVITY_UNQUALIFIED', 'pads': pads, 'before': board, 'after': board,
            'version': CONFIG['kicad_version'], 'board_acceptance': False}


TESTS = [ok(['python3', '-B', '-m', 'unittest'], 'OK'), ok(['python3', '-B', '-O', '-m', 'unittest'], 'OK')]


def run(mode, status='success', rec=None, inv=None, tests=TESTS, validator=True):
    return check_receipt.evaluate(CONFIG, mode, status, rec, inv, tests, str(VALIDATOR) if validator else None)


def mutate(mode, fn):
    r = copy.deepcopy(receipt(mode))
    fn(r)
    return r


def version_mismatch(r):
    r['commands'][2]['output'] = '10.0.5\n'
    r.update(status='FAILED', error='oracle command failed or exact version mismatch')


def cleanup_failure(r):
    r['cleanup'][-1] = {'name': 'osc-smoke-' + 'f' * 32, 'status': 'ABSENT'}
    r.update(status='FAILED', cleanup_error='create outcome uncertain')


def text(*names):
    return '\n'.join((SKILL / n).read_text() for n in names)


def scenarios():
    doc = text('SKILL.md', 'references/authority.md', 'references/troubleshooting.md', 'references/loop.md')
    green_identity = run('identity', rec=receipt('identity'), inv=inventory())
    missing = inventory()
    missing['pads'] = missing['pads'][1:]
    unread = run('identity', rec=None, inv=None, tests=None)
    lost = run('smoke', status='uncertain', rec=None, tests=None)
    bad_workflow = json.loads(WORKFLOW.read_text())
    bad_workflow['permissions'] = {'contents': 'write'}
    bad_text = WORKFLOW.read_text().replace('"contents": "read"', '"contents": "write"') + '\n# git push\n'
    yield 'positive: reference workflow passes lint', lint_workflow.lint(WORKFLOW.read_text(), json.loads(WORKFLOW.read_text())) == []
    yield 'positive: synthetic smoke receipt passes', run('smoke', rec=receipt('smoke'))['verdict'] == 'PASS'
    yield '1 version mismatch fails closed and keeps first failure', (
        (v := run('smoke', rec=mutate('smoke', version_mismatch)))['verdict'] == 'FAIL'
        and v['checks']['first_failure']['state'] == 'FAIL' and 'No unchanged rerun' in v['next_action'])
    yield '2 one missing pad fails even with anchors intact', (
        (v := run('identity', rec=receipt('identity'), inv=missing))['verdict'] == 'FAIL'
        and v['checks']['pad_count']['state'] == 'FAIL' and v['checks']['exact_identity']['state'] == 'FAIL')
    yield '3 cleanup failure / unknown create blocks dependent checks', (
        (v := run('smoke', rec=mutate('smoke', cleanup_failure)))['verdict'] == 'FAIL'
        and v['checks']['owned_containers_removed']['state'] == 'FAIL')
    yield '4 lost dispatch response is UNKNOWN and says inspect existing runs', (
        lost['verdict'] == 'UNKNOWN' and '既存runを確認' in doc and 'もう一度押さない' in doc)
    yield '5 nonpublic candidate upload stays UNIMPLEMENTED', (
        run('smoke', rec=mutate('smoke', lambda r: r.update(candidate_ingestion='INGESTED')))['verdict'] == 'FAIL'
        and 'UNIMPLEMENTED' in doc)
    yield '6 green identity is not connectivity/manufacturing PASS', (
        green_identity['verdict'] == 'PASS' and green_identity['dimensions']['identity'] == 'PASS'
        and all(green_identity['dimensions'][d] == 'NOT_EVALUATED' for d in check_receipt.NOT_JUDGED)
        and green_identity['adoption'] == 'OWNER_DECISION_REQUIRED')
    yield '7 artifact denial is UNKNOWN, no bypass', (
        unread['verdict'] == 'UNKNOWN' and 'do not bypass' in unread['next_action'] and '別URL' in doc)
    yield '8 routine offline correction needs no extra prompts', '確認を増やさない' in doc
    yield '9 no write permission, push, or auto adoption', (
        any('contents' in f for f in lint_workflow.lint(bad_text, bad_workflow))
        and any('git push' in f for f in lint_workflow.lint(bad_text, bad_workflow)) and 'route-shards.yml' in doc)
    tools = text('scripts/check_receipt.py', 'scripts/lint_workflow.py')
    yield '10 bundle grants nothing; tools are offline', (
        '新しい公開・dispatch・購入の許可は生まれない' in doc
        and not any(w in tools for w in ('urllib', 'requests', 'socket', 'subprocess', 'gh workflow')))


def main():
    rows = [(name, bool(passed)) for name, passed in scenarios()]
    for name, passed in rows:
        print(('PASS ' if passed else 'FAIL ') + name)
    failed = [n for n, p in rows if not p]
    print(f'{len(rows) - len(failed)}/{len(rows)} scenarios passed')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
