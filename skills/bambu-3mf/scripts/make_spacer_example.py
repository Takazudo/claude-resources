#!/usr/bin/env python3
"""Write direct mesh JSON for a ring spacer example. No CAD/STL dependency."""
import argparse
import json
import math
from pathlib import Path


def ring_mesh(outer_diameter, hole_diameter, height, segments=96):
    if not (outer_diameter > hole_diameter > 0 and height > 0 and segments >= 12):
        raise ValueError('Require outer diameter > hole diameter > 0, height > 0, segments >= 12.')
    vs, ts = [], []
    for z,r in ((0,outer_diameter/2),(height,outer_diameter/2),(0,hole_diameter/2),(height,hole_diameter/2)):
        vs += [[r*math.cos(i*2*math.pi/segments),r*math.sin(i*2*math.pi/segments),z]
               for i in range(segments)]
    for i in range(segments):
        j = (i+1)%segments
        a,b,c,d = i,j,segments+j,segments+i
        ts += [[a,b,c],[a,c,d]]  # outer wall
        a,b,c,d = 2*segments+i,3*segments+i,3*segments+j,2*segments+j
        ts += [[a,b,c],[a,c,d]]  # inner wall
        a,b,c,d = segments+i,segments+j,3*segments+j,3*segments+i
        ts += [[a,b,c],[a,c,d]]  # top annulus
        a,b,c,d = i,2*segments+i,2*segments+j,j
        ts += [[a,b,c],[a,c,d]]  # bottom annulus
    return {'vertices':vs,'triangles':ts}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output-dir',required=True)
    p.add_argument('--outer-diameter',type=float,default=16)
    p.add_argument('--hole-diameter',type=float,default=4.2)
    p.add_argument('--height',type=float,default=4)
    p.add_argument('--count',type=int,default=2)
    args = p.parse_args()
    if not 1 <= args.count <= 20:
        p.error('--count must be 1 through 20')
    out = Path(args.output_dir).resolve()
    out.mkdir(parents=True,exist_ok=True)
    mesh,manifest = out/'spacer.mesh.json',out/'spacers.manifest.json'
    if mesh.exists() or manifest.exists():
        p.error('Example output files already exist; choose a fresh directory.')
    mesh.write_text(json.dumps(ring_mesh(args.outer_diameter,args.hole_diameter,args.height)))
    manifest.write_text(json.dumps({'schema_version':1,'title':'H2D spacer example',
        'description':'Unsliced generated project. Nominal dimensions; physical fit not calibrated.',
        'objects':[{'name':f'Spacer {i+1}', 'mesh':mesh.name,'filament':1} for i in range(args.count)]},indent=2))
    print(json.dumps({'manifest':str(manifest),'mesh':str(mesh),
        'nominal_dimensions_mm':{'outer_diameter':args.outer_diameter,'hole_diameter':args.hole_diameter,'height':args.height}},indent=2))


if __name__ == '__main__':
    main()
