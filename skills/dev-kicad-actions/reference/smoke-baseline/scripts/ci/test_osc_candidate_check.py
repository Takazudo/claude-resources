import tempfile
import json
import contextlib
import io
import unittest
from pathlib import Path
from unittest.mock import patch
import osc_candidate_check as c

class SmokeTests(unittest.TestCase):
    def test_adapter_tracks_cid_and_inherits_group(self):
        with tempfile.TemporaryDirectory() as t:
            with patch.dict('os.environ',{'OSC_STATE':t,'OSC_REAL_DOCKER':'/usr/bin/docker'}):
                results=[dict(failure=None,exit_code=0,output='b'*64+'\n'),dict(failure=None,exit_code=0,output='10.0.6\n')]
                with patch.object(c,'run_command',side_effect=results) as call, contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(c.adapter(['run','--rm',c.IMAGE,'kicad-cli','version']),0)
                record=json.loads(next(Path(t).glob('owned-*.json')).read_text())
                self.assertEqual(record['cid'],'b'*64)
                self.assertTrue(all(x.kwargs['isolated'] is False for x in call.call_args_list))
                self.assertIn('--pids-limit',call.call_args_list[0].args[0])
                self.assertNotIn('--rm',call.call_args_list[0].args[0])
    def test_failed_create_preserves_uncertain_record(self):
        with tempfile.TemporaryDirectory() as t:
            with patch.dict('os.environ',{'OSC_STATE':t,'OSC_REAL_DOCKER':'/usr/bin/docker'}):
                with patch.object(c,'run_command',return_value=dict(failure='TIMEOUT',exit_code=-9,output='')):
                    with self.assertRaises(ValueError):c.adapter(['run','--rm',c.IMAGE])
                self.assertIsNone(json.loads(next(Path(t).glob('owned-*.json')).read_text())['cid'])
    def test_deadline_is_nonextendable(self):
        with patch.object(c,'DEADLINE',100):
            self.assertEqual(c.bounded_seconds(150,80),13)
            with self.assertRaises(TimeoutError):c.bounded_seconds(150,94)
    def test_normal_container_exit_required(self):
        row={'status':'REMOVED_CONFIRMED','state_before_cleanup':{'Running':False,'ExitCode':0}}
        c.normal_exit([row,row])
        for bad in [[],[row], [row,{'status':'ABSENT'}], [row,{'status':'REMOVED_CONFIRMED','state_before_cleanup':{'Running':True,'ExitCode':0}}]]:
            with self.assertRaises(ValueError):c.normal_exit(bad)
    def cleanup_case(self, missing=False, mismatch=False, remove_failure=False, unconfirmed=False):
        with tempfile.TemporaryDirectory() as t:
            state=Path(t);owner='a'*32;cid='b'*64
            record={'owner':owner,'name':'osc-smoke-'+owner,'cid':None if unconfirmed else cid}
            (state/('owned-'+owner+'.json')).write_text(json.dumps(record))
            calls=[];queries=0
            def call(args,root,seconds):
                nonlocal queries
                calls.append(args)
                if 'ls' in args:
                    queries+=1;output='' if missing or queries>1 else cid
                elif 'inspect' in args:
                    output=json.dumps([{'Id':cid,'Name':'/'+record['name'],'Config':{'Labels':{'osc.smoke.owner':'wrong' if mismatch else owner}}}])
                else:
                    if remove_failure:return dict(failure='TIMEOUT',exit_code=-9,output='')
                    output=cid
                return dict(failure=None,exit_code=0,output=output)
            if mismatch or remove_failure or (missing and unconfirmed):
                with self.assertRaises(ValueError): c.cleanup_owned(state,'docker',state,call)
            else:
                result=c.cleanup_owned(state,'docker',state,call)
                self.assertEqual(result[0]['status'],'ABSENT' if missing else 'REMOVED_CONFIRMED')
            if mismatch:self.assertFalse(any('rm' in x for x in calls))
            return calls
    def test_owned_exit_cleanup(self):
        calls=self.cleanup_case()
        self.assertEqual(calls[0][-1],'id='+'b'*64)
        self.assertEqual(calls[-1][-1],'id='+'b'*64)
    def test_timeout_owned_cleanup(self): self.cleanup_case(unconfirmed=True)
    def test_uncertain_create_absence(self): self.cleanup_case(missing=True,unconfirmed=True)
    def test_confirmed_absence(self): self.cleanup_case(missing=True)
    def test_ownership_mismatch_refuses_delete(self): self.cleanup_case(mismatch=True)
    def test_cleanup_failure(self): self.cleanup_case(remove_failure=True)
    def test_adapter_rejects_other_operations(self):
        for args in [['ps'],['run','--rm','other-image']]:
            with self.assertRaises(ValueError):c.adapter(args)
    def test_exact_version(self):
        c.exact_version(dict(failure=None,exit_code=0,output='10.0.6\n'))
        for v in ['10.0.5','10.0.6 extra','9.0.6']:
            with self.assertRaises(ValueError):c.exact_version(dict(failure=None,exit_code=0,output=v))
    def test_failed_exit(self):
        with self.assertRaises(ValueError):c.exact_version(dict(failure=None,exit_code=1,output='10.0.6'))
    def test_timeout(self):
        with self.assertRaises(ValueError):c.exact_version(dict(failure='TIMEOUT',exit_code=0,output='10.0.6'))
    def test_allowlist_and_hash(self):
        with tempfile.TemporaryDirectory() as t:
            r=Path(t);(r/'a').write_text('one')
            with patch.object(c,'PINS',{'a':c.sha(r/'a')}):
                self.assertEqual(set(c.snapshot(r)),{'a'})
                (r/'a').write_text('two')
                with self.assertRaises(ValueError):c.snapshot(r)
                (r/'extra').write_text('x')
                with self.assertRaises(ValueError):c.snapshot(r)
    def test_only_version_commands(self):
        self.assertEqual(c.COMMANDS,[['bash','scripts/kicad/run.sh','kicad-cli','version'],['bash','scripts/kicad/run.sh','python3','-c','import pcbnew; print(pcbnew.GetBuildVersion())']])
    def test_workflow_contract(self):
        s=(Path(__file__).resolve().parents[2]/'.github/workflows/osc-candidate-check.yml').read_text()
        w=json.loads(s) # JSON is a YAML subset: validate real structure without optional packages.
        self.assertEqual(w['permissions'],{'contents':'read'})
        self.assertEqual(set(w['on']),{'workflow_dispatch'})
        self.assertFalse(w['concurrency']['cancel-in-progress'])
        self.assertEqual(len(w['jobs']),1)
        j=next(iter(w['jobs'].values()))
        self.assertEqual(j['runs-on'],'ubuntu-24.04');self.assertEqual(j['timeout-minutes'],20)
        checkouts=[x for x in j['steps'] if x.get('uses','').startswith('actions/checkout@')]
        self.assertEqual(len(checkouts),2)
        self.assertTrue(all(x['with']['persist-credentials'] is False for x in checkouts))
        self.assertEqual(checkouts[1]['with']['ref'],c.SOURCE)
        upload=j['steps'][-1];self.assertEqual(upload['with']['retention-days'],7)
        self.assertEqual(upload['with']['path'],'upload-safe/receipt.json\nupload-safe/tests.json')
        self.assertLessEqual(sum(x['timeout-minutes'] for x in j['steps']),20)
        for forbidden in ['contents: write','secrets.','git push','workflow_run','actions/cache','pickle','max-parallel:']:
            self.assertNotIn(forbidden,s)
    def test_artifact_directory_attack(self):
        w=json.loads((Path(__file__).resolve().parents[2]/'.github/workflows/osc-candidate-check.yml').read_text())
        script=next(iter(w['jobs'].values()))['steps'][-2]['run'].split("\n",1)[1].rsplit('\nPY',1)[0]
        import os
        with tempfile.TemporaryDirectory() as t:
            previous=Path.cwd()
            try:
                os.chdir(t);Path('receipts/receipt.json').mkdir(parents=True)
                Path('receipts/receipt.json/board').write_text('not permitted')
                with self.assertRaises(SystemExit):exec(compile(script,'artifact-stage','exec'),{})
                self.assertEqual(json.loads(Path('upload-safe/receipt.json').read_text())['status'],'ARTIFACT_POLICY_FAILURE')
                self.assertEqual([x.name for x in Path('upload-safe').iterdir()],['receipt.json'])
            finally:os.chdir(previous)
if __name__=='__main__':unittest.main()
