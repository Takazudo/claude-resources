"""Frozen-source version smoke only. No candidate ingestion or CAD operations."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import threading
import time
import shutil
import sys
import tempfile
import uuid
import shlex

SOURCE = 'fa16c6ffa6497f095e1902c223150c23fafccd6e'
IMAGE = 'kicad/kicad@sha256:18693567392b80da435f9fa952ce3a3e534c66eb5a6033f5b9c80aa3b19dd3ec'
PINS = {'scripts/kicad/run.sh':'bc74f0ade82c29d64c44119ea435bc7bfd164fc06e9afff240a3cb2b44b272a0',
        'scripts/kicad/pin.env':'769e2be0b61e7d92a6930684f13166b7dc098522008de3969cd30d6c4a363246',
        'package.json':'ff749b4655a4cbe22c74ea248b3354a0a9ba22cc08d512ec24be3bc55b24261e'}
COMMANDS = [['bash','scripts/kicad/run.sh','kicad-cli','version'],
            ['bash','scripts/kicad/run.sh','python3','-c','import pcbnew; print(pcbnew.GetBuildVersion())']]
LIMIT = 1024 * 1024
DEADLINE = None

def bounded_seconds(seconds, now=None):
    if DEADLINE is None: return seconds
    remaining=DEADLINE-(time.monotonic() if now is None else now)-7
    if remaining<=0: raise TimeoutError('job-local execution budget exhausted')
    return min(seconds,remaining)

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def snapshot(root):
    files=[]
    for base, dirs, names in os.walk(root, followlinks=False):
        dirs[:] = [d for d in dirs if not (Path(base)==root and d=='.git')]
        for d in dirs:
            if (Path(base)/d).is_symlink(): raise ValueError('symlink directory')
        for name in names:
            p=Path(base)/name
            if p.is_symlink(): raise ValueError('symlink input')
            files.append(p.relative_to(root).as_posix())
    if set(files)!=set(PINS): raise ValueError('source path allowlist mismatch')
    result={name:sha(root/name) for name in PINS}
    if result!=PINS: raise ValueError('frozen source hash mismatch')
    return result

def run_command(argv, root, seconds=150, extra_env=None, isolated=True):
    seconds=bounded_seconds(seconds)
    env={k:v for k,v in os.environ.items() if k in ('PATH','HOME','TMPDIR','LANG')}
    env.update(PYTHONDONTWRITEBYTECODE='1',OMP_NUM_THREADS='1',OPENBLAS_NUM_THREADS='1')
    if extra_env: env.update(extra_env)
    try:
        p=subprocess.Popen(argv,cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=isolated)
    except OSError as exc:
        return dict(argv=argv,exit_code=None,elapsed_seconds=0,failure='LAUNCH_FAILED',output=str(exc)[:4096])
    chunks=[]; size=0; overflow=threading.Event()
    def reader():
        nonlocal size
        while True:
            b=p.stdout.read(4096)
            if not b: break
            if size+len(b)>LIMIT: overflow.set(); break
            chunks.append(b);size+=len(b)
    t=threading.Thread(target=reader,daemon=True);t.start();start=time.monotonic()
    reason=None
    while p.poll() is None:
        if overflow.is_set() or time.monotonic()-start>seconds:
            reason='OUTPUT_LIMIT' if overflow.is_set() else 'TIMEOUT'
            if isolated: os.killpg(p.pid,signal.SIGKILL)
            else: p.kill()
            break
        time.sleep(.05)
    p.wait(timeout=5);t.join(timeout=2)
    if t.is_alive(): reason=reason or 'OUTPUT_PIPE_UNCERTAIN'
    if overflow.is_set(): reason='OUTPUT_LIMIT'
    return dict(argv=argv,exit_code=p.returncode,elapsed_seconds=time.monotonic()-start,
                failure=reason,output=b''.join(chunks).decode('utf-8',errors='replace'))

def exact_version(result):
    if result['failure'] or result['exit_code']!=0 or result['output'].strip()!='10.0.6':
        raise ValueError('oracle command failed or exact version mismatch')

def checked(result):
    if result['failure'] or result['exit_code'] != 0:
        raise ValueError('Docker operation failed: '+str(result))
    return result['output'].strip()

def owned_identity(info, record):
    return (info.get('Name')=='/'+record['name'] and
            info.get('Config',{}).get('Labels',{}).get('osc.smoke.owner')==record['owner'] and
            (not record.get('cid') or info.get('Id')==record['cid']))

def normal_exit(outcomes):
    if len(outcomes)!=2: raise ValueError('wrapper must account for exactly two containers')
    for row in outcomes:
        state=row.get('state_before_cleanup') or {}
        if row['status']!='REMOVED_CONFIRMED' or state.get('Running') is not False or state.get('ExitCode')!=0:
            raise ValueError('normal container exit unproven')

def cleanup_owned(state, docker, root, call=run_command, outcomes=None):
    if outcomes is None: outcomes=[]
    for path in sorted(state.glob('owned-*.json')):
        record=json.loads(path.read_text())
        name=record['name'];owner=record['owner']
        if name!='osc-smoke-'+owner or len(owner)!=32 or any(c not in '0123456789abcdef' for c in owner):
            raise ValueError('invalid ownership record')
        # Once recorded, CID remains authoritative even if a name is changed.
        selector='id='+record['cid'] if record.get('cid') else 'name=^/'+name+'$'
        ids=checked(call([docker,'container','ls','-aq','--no-trunc','--filter',selector],root,5)).splitlines()
        if not ids:
            # An interrupted create may still be pending in the daemon. Absence is not a pass.
            if not record.get('cid'): raise ValueError('create outcome uncertain: '+name)
            outcomes.append({'name':name,'status':'ABSENT'});continue
        if len(ids)!=1: raise ValueError('ambiguous owned container')
        info=json.loads(checked(call([docker,'container','inspect',ids[0]],root,5)))[0]
        if info.get('Id')!=ids[0] or not owned_identity(info,record): raise ValueError('container ownership mismatch')
        checked(call([docker,'container','rm','--force',info['Id']],root,5))
        remaining=checked(call([docker,'container','ls','-aq','--no-trunc','--filter','id='+info['Id']],root,5))
        if remaining: raise ValueError('owned container still present')
        outcomes.append({'name':name,'cid':info['Id'],'status':'REMOVED_CONFIRMED',
                         'state_before_cleanup':info.get('State')})
        path.unlink() # Only completed job-local bookkeeping; outcomes retained in receipt.
    return outcomes

def adapter(argv):
    # The unchanged oracle discovers docker through PATH. This adapter supports only its run shape.
    if not argv or argv[0]!='run' or argv.count(IMAGE)!=1 or '--rm' not in argv:
        raise ValueError('unsupported Docker adapter operation')
    if any(x in argv for x in ['--name','--cidfile','--label','--privileged','--network=host']):
        raise ValueError('unexpected ownership/security option')
    state=Path(os.environ['OSC_STATE']);docker=os.environ['OSC_REAL_DOCKER']
    owner=uuid.uuid4().hex;record={'name':'osc-smoke-'+owner,'owner':owner,'cid':None}
    path=state/('owned-'+owner+'.json');path.write_text(json.dumps(record))
    args=[x for x in argv[1:] if x!='--rm']
    result=run_command([docker,'create','--name',record['name'],'--label','osc.smoke.owner='+owner,
        '--cpus','1','--memory','512m','--pids-limit','64',*args],Path.cwd(),10,isolated=False)
    cid=checked(result)
    if len(cid)!=64 or any(c not in '0123456789abcdef' for c in cid): raise ValueError('invalid created CID')
    record['cid']=cid
    tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(record));tmp.replace(path)
    result=run_command([docker,'start','--attach',cid],Path.cwd(),120,isolated=False)
    sys.stdout.write(result['output']);sys.stdout.flush()
    return result['exit_code'] if not result['failure'] and result['exit_code'] is not None else 1

def main():
    global DEADLINE
    DEADLINE=time.monotonic()+480 # Eight minutes inside nine-minute smoke step.
    a=argparse.ArgumentParser();a.add_argument('--source',type=Path,required=True);a.add_argument('--out',type=Path,required=True)
    args=a.parse_args();root=args.source.resolve();out=args.out.resolve()
    if out==root or out.is_relative_to(root): raise ValueError('output must be separate')
    out.mkdir(parents=True,exist_ok=True)
    receipt={'status':'STARTED','source_sha':SOURCE,'tooling_sha':os.environ.get('TOOLING_SHA'),
             'image':IMAGE,'candidate_ingestion':'UNIMPLEMENTED','commands':[], 'workers':1}
    def save():
        (out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    save();failed=False;state=None;docker=None
    try:
        if not receipt['tooling_sha'] or len(receipt['tooling_sha'])!=40 or any(c not in '0123456789abcdef' for c in receipt['tooling_sha']):
            raise ValueError('immutable tooling SHA required')
        receipt['tool_hashes']={Path(__file__).name:sha(Path(__file__)),
            'tests':sha(Path(__file__).with_name('test_osc_candidate_check.py')),
            'workflow':sha(Path(__file__).resolve().parents[2]/'.github/workflows/osc-candidate-check.yml')}
        receipt['before']=snapshot(root);save()
        head=run_command(['git','rev-parse','HEAD'],root,10);receipt['commands'].append(head);save()
        if head['failure'] or head['exit_code'] or head['output'].strip()!=SOURCE: raise ValueError('source HEAD mismatch')
        # Pull is explicit: diagnostics execute with --network none after image availability.
        pull=run_command(['docker','pull',IMAGE],root,120);receipt['commands'].append(pull);save()
        if pull['failure'] or pull['exit_code']: raise ValueError('pinned image pull failed')
        docker=shutil.which('docker')
        if not docker: raise ValueError('Docker unavailable')
        state=Path(tempfile.mkdtemp(prefix='osc-smoke-owned-'))
        shim=state/'docker'
        shim.write_text('#!/bin/sh\nexec '+shlex.quote(sys.executable)+' '+shlex.quote(str(Path(__file__).resolve()))+' --docker-adapter "$@"\n')
        shim.chmod(0o700)
        adapter_env={'PATH':str(state)+os.pathsep+os.environ['PATH'],'OSC_STATE':str(state),'OSC_REAL_DOCKER':docker}
        receipt['cleanup']=[]
        for command in COMMANDS:
            if DEADLINE-time.monotonic()<200:
                raise TimeoutError('insufficient command plus 100-second cleanup reserve')
            first=len(receipt['cleanup'])
            result=run_command(command,root,100,adapter_env);receipt['commands'].append(result);save()
            cleanup_owned(state,docker,root,outcomes=receipt['cleanup']);save();exact_version(result)
            normal_exit(receipt['cleanup'][first:])
        receipt['status']='FROZEN_SOURCE_SMOKE_PASS_NOT_BOARD_ACCEPTANCE'
    except Exception as exc:
        receipt.update(status='FAILED',error=str(exc));failed=True
    finally:
        if state is not None:
            try: cleanup_owned(state,docker,root,outcomes=receipt['cleanup'])
            except Exception as exc: receipt.update(status='FAILED',cleanup_error=str(exc));failed=True
        try: receipt['after']=snapshot(root)
        except Exception as exc: receipt.update(status='FAILED',after_error=str(exc));failed=True
        receipt['cleanup_limit']='Owned names/CIDs/labels checked; removal confirmed before dependent work. Uncertain create/cleanup fails closed. Hosted job teardown remains outer bound after abrupt controller/runner loss.'
        save()
    return 1 if failed else 0

if __name__=='__main__':
    raise SystemExit(adapter(sys.argv[2:]) if sys.argv[1:2]==['--docker-adapter'] else main())
