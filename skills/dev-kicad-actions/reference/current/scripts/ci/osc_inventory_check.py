"""Job-local controller for public frozen identity inventory only."""
import json
import os
from pathlib import Path, PurePosixPath
import shlex
import shutil
import sys
import tempfile
import time
import osc_candidate_check as c
import osc_frozen_board_inventory as inv

def readonly_args(argv, root, payload):
    expected=[str(root)+':/work']
    mounts=[argv[i+1] for i,v in enumerate(argv[:-1]) if v=='--volume']
    if len(mounts)!=2 or mounts[0]!=expected[0]: raise ValueError('unexpected oracle mounts')
    home=mounts[1]
    if not home.endswith(':/tmp/kicad-home') or not PurePosixPath(home.split(':',1)[0]).is_absolute():
        raise ValueError('unexpected HOME mount')
    if any(a.startswith(('--mount','--volume=')) or a=='-v' for a in argv): raise ValueError('alternate mounts forbidden')
    if argv.count('--network')!=1 or argv[argv.index('--network')+1]!='none': raise ValueError('network must be none')
    result=list(argv);result[result.index(expected[0])]=expected[0]+':ro'
    i=result.index(c.IMAGE);result[i:i]=['--volume',str(payload)+':/inventory.py:ro']
    return result

def adapter(argv):
    root=Path(os.environ['OSC_INPUT_ROOT']);payload=Path(os.environ['OSC_PAYLOAD'])
    return c.adapter(readonly_args(argv,root,payload))

def main():
    if len(sys.argv)!=3: raise ValueError('usage: osc_inventory_check.py SOURCE OUT')
    root=Path(sys.argv[1]).resolve();out=Path(sys.argv[2]).resolve()
    if root==out or out.is_relative_to(root): raise ValueError('output must be separate')
    out.mkdir(exist_ok=False)
    payload=Path(__file__).with_name('osc_frozen_board_inventory.py').resolve()
    c.DEADLINE=time.monotonic()+480
    c.PINS={**c.PINS,inv.BOARD:inv.BOARD_HASH}
    receipt=dict(status='STARTED',source_sha=c.SOURCE,tooling_sha=os.environ.get('TOOLING_SHA'),
        image=c.IMAGE,commands=[],cleanup=[],candidate_ingestion='UNIMPLEMENTED')
    state=None;docker=None;failed=False
    def save(): (out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    save()
    try:
        tooling=receipt['tooling_sha']
        if not tooling or len(tooling)!=40 or any(x not in '0123456789abcdef' for x in tooling): raise ValueError('tooling SHA required')
        receipt['tool_hashes']={p.name:c.sha(p) for p in [Path(__file__),payload,Path(c.__file__)]}
        receipt['before']=c.snapshot(root)
        head=c.run_command(['git','rev-parse','HEAD'],root,10);receipt['commands'].append(head)
        if c.checked(head)!=c.SOURCE: raise ValueError('source HEAD mismatch')
        docker=shutil.which('docker')
        if not docker: raise ValueError('Docker unavailable')
        pull=c.run_command([docker,'pull',c.IMAGE],root,120);receipt['commands'].append(pull);c.checked(pull)
        state=Path(tempfile.mkdtemp(prefix='osc-inventory-owned-'))
        shim=state/'docker';shim.write_text('#!/bin/sh\nexec '+shlex.quote(sys.executable)+' '+shlex.quote(str(Path(__file__).resolve()))+' --adapter "$@"\n');shim.chmod(0o700)
        env={'PATH':str(state)+os.pathsep+os.environ['PATH'],'OSC_STATE':str(state),'OSC_REAL_DOCKER':docker,
             'OSC_INPUT_ROOT':str(root),'OSC_PAYLOAD':str(payload)}
        commands=[*c.COMMANDS,['bash','scripts/kicad/run.sh','python3','-B','/inventory.py']]
        for n,command in enumerate(commands):
            if c.DEADLINE-time.monotonic()<200: raise TimeoutError('insufficient command and cleanup reserve')
            first=len(receipt['cleanup'])
            result=c.run_command(command,root,100,env);receipt['commands'].append(result);save()
            c.cleanup_owned(state,docker,root,outcomes=receipt['cleanup']);save()
            c.normal_exit(receipt['cleanup'][first:])
            if n<2: c.exact_version(result)
            else:
                data=json.loads(c.checked(result));inv.validate(data['pads'])
                if data['status']!='IDENTITY_ONLY_CONNECTIVITY_UNQUALIFIED' or data['before']!=inv.BOARD_HASH or data['after']!=inv.BOARD_HASH:
                    raise ValueError('inventory result mismatch')
                (out/'inventory.json').write_text(json.dumps(data,indent=2)+'\n')
        receipt['status']='IDENTITY_INVENTORY_COMPLETE_NOT_CONNECTIVITY_ACCEPTANCE'
    except Exception as exc:
        failed=True;receipt.update(status='FAILED',error=str(exc))
    finally:
        if state is not None:
            try:c.cleanup_owned(state,docker,root,outcomes=receipt['cleanup'])
            except Exception as exc:failed=True;receipt.update(status='FAILED',cleanup_error=str(exc))
        try:receipt['after']=c.snapshot(root)
        except Exception as exc:failed=True;receipt.update(status='FAILED',after_error=str(exc))
        save()
    return int(failed)

if __name__=='__main__':
    raise SystemExit(adapter(sys.argv[2:]) if sys.argv[1:2]==['--adapter'] else main())
