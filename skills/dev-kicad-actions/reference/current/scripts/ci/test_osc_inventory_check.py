import ast
import json
from pathlib import Path, PurePosixPath
import tempfile
import unittest
from unittest.mock import patch
import osc_inventory_check as run
import osc_frozen_board_inventory as inv

def rows():
    return [dict(ref=k.split('.')[0],number=k.split('.')[1],uuid=v['uuid'],net=v['net'],x_nm=0,y_nm=0,
                 layer='F.Cu',orientation_deg=0,flipped=False) for k,v in inv.EXPECTED.items()]

class InventoryTests(unittest.TestCase):
    def test_invalid_present_fields(self):
        for key,value in [('x_nm',None),('y_nm','x'),('layer',None),('orientation_deg',float('nan')),('flipped',None),('net',None)]:
            r=rows();r[0][key]=value
            with self.assertRaises(ValueError):inv.validate(r)
    def test_valid_identity_does_not_imply_connectivity(self):
        self.assertEqual(inv.validate(rows()),rows())
        self.assertIn('CONNECTIVITY_UNQUALIFIED',Path(inv.__file__).read_text())
    def test_mismatched_identity(self):
        r=rows();r[0]['net']='AGND'
        with self.assertRaises(ValueError):inv.validate(r)
    def test_missing_anchor(self):
        with self.assertRaises(ValueError):inv.validate(rows()[1:])
    def test_missing_field(self):
        r=rows();del r[0]['layer']
        with self.assertRaises(ValueError):inv.validate(r)
    def test_duplicate_uuid(self):
        r=rows();r[1]['uuid']=r[0]['uuid']
        with self.assertRaises(ValueError):inv.validate(r)
    def test_duplicate_pad(self):
        r=rows();r.append(dict(r[0],uuid='other'))
        with self.assertRaises(ValueError):inv.validate(r)
    def test_scope(self):
        self.assertTrue(inv.selected('RVO1107'));self.assertFalse(inv.selected('U1205'))
    def args(self):
        return ['run','--rm','--network','none','--volume','/source:/work','--volume','/tmp/home:/tmp/kicad-home',run.c.IMAGE]
    def test_readonly_exact_mount(self):
        r=run.readonly_args(self.args(),PurePosixPath('/source'),PurePosixPath('/payload.py'))
        self.assertIn('/source:/work:ro',r);self.assertIn('/payload.py:/inventory.py:ro',r)
    def test_unexpected_mount(self):
        a=self.args();a[a.index('/source:/work')]='/other:/work'
        with self.assertRaises(ValueError):run.readonly_args(a,PurePosixPath('/source'),PurePosixPath('/payload.py'))
    def test_network_and_mount_alias(self):
        for extra in [['--mount=x'],['-v','/secret:/x']]:
            with self.assertRaises(ValueError):run.readonly_args(self.args()+extra,PurePosixPath('/source'),PurePosixPath('/payload.py'))
        a=self.args();a[a.index('none')]='host'
        with self.assertRaises(ValueError):run.readonly_args(a,PurePosixPath('/source'),PurePosixPath('/payload.py'))
    def test_no_board_mutation_calls(self):
        tree=ast.parse(Path(inv.__file__).read_text())
        calls={x.func.attr for x in ast.walk(tree) if isinstance(x,ast.Call) and isinstance(x.func,ast.Attribute)}
        self.assertFalse(calls & {'SaveBoard','Save','Fill','Add','Remove','Delete','SetNetCode'})
    def test_cleanup_failure_stops_following_commands(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t)/'source';root.mkdir();out=Path(t)/'out'
            good=lambda output:dict(output=output,failure=None,exit_code=0)
            with patch.object(run.sys,'argv',['controller',str(root),str(out)]), patch.dict(run.os.environ,{'TOOLING_SHA':'a'*40}), \
                 patch.object(run.c,'snapshot',return_value={}), patch.object(run.shutil,'which',return_value='docker'), \
                 patch.object(run.c,'run_command',side_effect=[good(run.c.SOURCE),good('pulled'),good('10.0.6')]) as command, \
                 patch.object(run.c,'cleanup_owned',side_effect=ValueError('cleanup failure')):
                self.assertEqual(run.main(),1)
            self.assertEqual(command.call_count,3)
            result=json.loads((out/'receipt.json').read_text())
            self.assertEqual(result['status'],'FAILED');self.assertIn('cleanup_error',result)
            self.assertFalse((out/'inventory.json').exists())

if __name__=='__main__':unittest.main()
