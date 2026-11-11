#!/usr/bin/env python3
"""Create unsliced Bambu Studio projects from an empty template. Python 3.10+.

No third-party dependencies, printer connection, or slicer invocation.
Mesh inputs are {vertices: [[x,y,z], ...], triangles: [[a,b,c], ...]} JSON
or STL. Settings edits are deliberately limited to common process settings.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import posixpath
import re
import struct
import sys
import tempfile
import uuid
from urllib.parse import unquote
import xml.etree.ElementTree as ET
from zipfile import ZipFile, ZIP_DEFLATED, BadZipFile

CORE = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'
PROD = 'http://schemas.microsoft.com/3dmanufacturing/production/2015/06'
BBL = 'http://schemas.bambulab.com/package/2021'
RELS = 'http://schemas.openxmlformats.org/package/2006/relationships'
CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
MODEL = '3D/3dmodel.model'
SETTINGS = 'Metadata/project_settings.config'
OBJECTS = 'Metadata/model_settings.config'
TEMPLATE = Path(__file__).resolve().parents[1] / 'assets' / 'h2d-empty.3mf'
IDENTITY = '1 0 0 0 1 0 0 0 1 0 0 0'
MATRIX4 = '1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1'
MAX_ARCHIVE = 256 * 1024 * 1024
MAX_TRIANGLES = 1_000_000
ET.register_namespace('', CORE)
ET.register_namespace('p', PROD)
ET.register_namespace('BambuStudio', BBL)


class ProjectError(ValueError):
    pass


def require(ok, message):
    if not ok:
        raise ProjectError(message)


def finite_number(value):
    require(not isinstance(value, bool), 'Boolean is not a coordinate.')
    try:
        result = float(value)
    except (TypeError, ValueError):
        raise ProjectError(f'Expected a finite number: {value!r}')
    require(math.isfinite(result), f'Nonfinite number: {value!r}')
    return result


def fmt(value):
    return format(float(value), '.12g')


def local(tag):
    return tag.rsplit('}', 1)[-1]


def q(tag):
    return f'{{{CORE}}}{tag}'


def xml_bytes(root):
    ET.indent(root, space='  ')
    return ET.tostring(root, encoding='utf-8', xml_declaration=True)


def parse_xml(data, label):
    require(b'<!DOCTYPE' not in data.upper() and b'<!ENTITY' not in data.upper(),
            f'DTD/entities are not supported: {label}')
    try:
        return ET.fromstring(data)
    except ET.ParseError as e:
        raise ProjectError(f'Invalid XML in {label}: {e}')


def read_archive(path):
    with ZipFile(path) as z:
        names = z.namelist()
        require(len(names) == len(set(names)), 'Duplicate ZIP members.')
        require(sum(i.file_size for i in z.infolist()) <= MAX_ARCHIVE,
                'Archive exceeds the 256 MiB uncompressed limit.')
        for n in names:
            require(not n.startswith('/') and '\\' not in n and '..' not in PurePosixPath(n).parts,
                    f'Unsafe ZIP member: {n}')
        data = {n: z.read(n) for n in names if not n.endswith('/')}
    require(MODEL in data and SETTINGS in data and OBJECTS in data,
            'Expected a Bambu Studio project with model and project/model settings.')
    return data


def write_archive(data, output, source=None):
    output = Path(output).resolve()
    if source:
        require(output != Path(source).resolve(), 'Write to a new path; never overwrite the input/template.')
    require(not output.exists(), f'Output already exists: {output}. Choose a new revision filename.')
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=output.parent, suffix='.3mf.tmp', delete=False) as f:
        temporary = Path(f.name)
    try:
        with ZipFile(temporary, 'w', ZIP_DEFLATED) as z:
            for n, content in data.items():
                z.writestr(n, content)
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)


def settings(data):
    result = json.loads(data[SETTINGS])
    require(isinstance(result, dict), 'Project settings must be a JSON object.')
    return result


def summary(data):
    d = settings(data)
    root = parse_xml(data[MODEL], MODEL)
    conf = parse_xml(data[OBJECTS], OBJECTS)
    keys = ('version', 'printer_model', 'printer_settings_id', 'nozzle_diameter',
            'curr_bed_type', 'print_settings_id', 'layer_height', 'wall_loops',
            'sparse_infill_density', 'enable_support', 'print_sequence',
            'filament_settings_id', 'filament_type', 'filament_colour',
            'filament_map', 'filament_nozzle_map', 'printable_area', 'printable_height',
            'extruder_printable_area', 'extruder_printable_height', 'wrapping_exclude_area')
    return {
        'settings': {k: d[k] for k in keys if k in d},
        'project_settings_sha256': hashlib.sha256(data[SETTINGS]).hexdigest(),
        'units': root.get('unit', 'millimeter'),
        'root_build_items': len(root.findall(f'{q("build")}/{q("item")}')),
        'plates': len(conf.findall('plate')),
        'contains_toolpaths': any(is_toolpath(n) for n in data),
        'members': [{'path': n, 'bytes': len(v)} for n, v in data.items()],
    }


def validate_mesh(vertices, triangles, label):
    require(vertices and triangles, f'{label}: empty mesh.')
    require(len(triangles) <= MAX_TRIANGLES, f'{label}: too many triangles.')
    require(all(isinstance(v, (list, tuple)) and len(v) == 3 for v in vertices),
            f'{label}: each vertex must have three coordinates.')
    vertices = [tuple(finite_number(c) for c in v) for v in vertices]
    require(all(isinstance(t, (list, tuple)) and len(t) == 3 for t in triangles),
            f'{label}: each triangle must have three indices.')
    edges = Counter()
    directed = Counter()
    seen = set()
    volume = 0.0
    ref = vertices[0]
    for tri in triangles:
        require(all(isinstance(i, int) and not isinstance(i, bool) and 0 <= i < len(vertices)
                    for i in tri), f'{label}: invalid vertex index.')
        a, b, c = tri
        key = tuple(sorted(tri))
        require(len(set(tri)) == 3 and key not in seen, f'{label}: degenerate or duplicate triangle.')
        seen.add(key)
        va, vb, vc = vertices[a], vertices[b], vertices[c]
        u = [vb[i]-va[i] for i in range(3)]
        v = [vc[i]-va[i] for i in range(3)]
        cross = (u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0])
        require(sum(x*x for x in cross) > 1e-20, f'{label}: zero-area triangle.')
        volume += sum((va[i]-ref[i])*cross[i] for i in range(3)) / 6.0
        for start, end in ((a,b), (b,c), (c,a)):
            edges[tuple(sorted((start,end)))] += 1
            directed[(start,end)] += 1
    require(all(count == 2 for count in edges.values()),
            f'{label}: mesh has boundary/nonmanifold edges; repair the CAD export.')
    require(all(directed[(b,a)] == count for (a,b), count in directed.items()),
            f'{label}: inconsistent triangle winding.')
    require(volume > 1e-9, f'{label}: nonpositive signed volume; check winding.')
    return vertices, [tuple(t) for t in triangles], {'vertices': len(vertices),
        'triangles': len(triangles), 'signed_volume_mm3': round(volume, 6)}


def read_mesh(value, base):
    if isinstance(value, dict):
        doc = value
    else:
        require(isinstance(value, str), 'mesh must be a JSON object or a mesh JSON/STL path.')
        path = (base / value).resolve()
        if path.suffix.lower() == '.stl':
            raw = path.read_bytes()
            triangles, vertices, index = [], [], {}
            points = []
            if len(raw) >= 84 and len(raw) == 84 + 50*struct.unpack_from('<I', raw, 80)[0]:
                count = struct.unpack_from('<I', raw, 80)[0]
                require(count <= MAX_TRIANGLES, 'Too many STL triangles.')
                for i in range(count):
                    values = struct.unpack_from('<12fH', raw, 84 + i*50)
                    points.extend(tuple(values[j:j+3]) for j in (3,6,9))
            else:
                try:
                    s = raw.decode('ascii')
                except UnicodeError:
                    raise ProjectError('STL is neither a well-sized binary STL nor ASCII STL.')
                for match in re.finditer(r'\bvertex\s+(\S+)\s+(\S+)\s+(\S+)', s):
                    points.append(tuple(finite_number(v) for v in match.groups()))
                require(len(points) % 3 == 0, 'ASCII STL vertex count is not divisible by 3.')
            for i in range(0, len(points), 3):
                tri = []
                for point in points[i:i+3]:
                    if point not in index:
                        index[point] = len(vertices)
                        vertices.append(point)
                    tri.append(index[point])
                triangles.append(tri)
            doc = {'vertices': vertices, 'triangles': triangles}
        else:
            doc = json.loads(path.read_text())
    require(isinstance(doc, dict) and 'vertices' in doc and 'triangles' in doc,
            'Mesh JSON needs vertices and triangles arrays.')
    return validate_mesh(doc['vertices'], doc['triangles'], 'input mesh')


def bbox(vertices):
    require(bool(vertices), 'Cannot bound an empty object.')
    return ([min(v[i] for v in vertices) for i in range(3)],
            [max(v[i] for v in vertices) for i in range(3)])


def rect_from_polygon(values, label):
    if isinstance(values, str):
        values = values.split(',')
    require(isinstance(values, list) and len(values) >= 4, f'{label}: expected a polygon.')
    points = [tuple(finite_number(v) for v in p.split('x')) for p in values]
    require(all(len(p) == 2 for p in points), f'{label}: expected x/y polygon coordinates.')
    xs, ys = sorted(set(x for x,y in points)), sorted(set(y for x,y in points))
    require(len(xs) == 2 and len(ys) == 2 and set(points) == {(x,y) for x in xs for y in ys},
            f'{label}: this helper supports rectangular areas only; use Studio for this bed.')
    return [xs[0], ys[0], xs[1], ys[1]]


def usable_bed(d):
    areas = [rect_from_polygon(d['printable_area'], 'printable_area')]
    areas += [rect_from_polygon(v, 'extruder_printable_area')
              for v in d.get('extruder_printable_area', []) if v]
    r = [max(a[0] for a in areas), max(a[1] for a in areas),
         min(a[2] for a in areas), min(a[3] for a in areas)]
    heights = [finite_number(d['printable_height'])]
    heights += [finite_number(h) for h in d.get('extruder_printable_height', []) if h]
    excluded = []
    for key in ('bed_exclude_area', 'wrapping_exclude_area'):
        if d.get(key):
            excluded.append(rect_from_polygon(d[key], key))
    require(r[2] > r[0] and r[3] > r[1], 'No common rectangular nozzle area.')
    return r, min(heights), excluded


def overlaps(a, b, gap=0):
    return a[0] < b[2]+gap-1e-7 and a[2] > b[0]-gap+1e-7 and \
           a[1] < b[3]+gap-1e-7 and a[3] > b[1]-gap+1e-7


def check_bounds(bounds, d, label, margin=0):
    r, height, excluded = usable_bed(d)
    lo, hi = bounds
    require(lo[0] >= r[0]+margin-1e-6 and lo[1] >= r[1]+margin-1e-6 and
            hi[0] <= r[2]-margin+1e-6 and hi[1] <= r[3]-margin+1e-6 and
            lo[2] >= -1e-6 and hi[2] <= height+1e-6,
            f'{label}: bounds {bounds} exceed the common nozzle area {r}, height {height}.')
    require(abs(lo[2]) < 1e-5, f'{label}: object does not rest on Z=0.')
    rectangle = [lo[0], lo[1], hi[0], hi[1]]
    require(not any(overlaps(rectangle, e) for e in excluded),
            f'{label}: overlaps an excluded bed area.')
    return rectangle


INTEGER_SETTINGS = {'wall_loops': (1, 100), 'top_shell_layers': (0, 100),
                    'bottom_shell_layers': (0, 100), 'skirt_loops': (0, 100)}
FLOAT_SETTINGS = {'layer_height': (0.01, 2), 'initial_layer_print_height': (0.01, 2),
                  'brim_width': (0, 100), 'brim_object_gap': (0, 10),
                  'support_threshold_angle': (0, 90)}
BOOL_SETTINGS = {'enable_support', 'support_on_build_plate_only'}
ENUM_SETTINGS = {'sparse_infill_pattern': {'grid','gyroid','cubic','adaptivecubic',
                    'alignedrectilinear','rectilinear','honeycomb','triangles','3dhoneycomb',
                    'lightning','supportcubic','concentric'},
                 'brim_type': {'auto_brim','outer_only','inner_only','outer_and_inner','no_brim'},
                 'support_type': {'normal(auto)','tree(auto)','normal(manual)','tree(manual)'},
                 'seam_position': {'nearest','aligned','rear','random'}}


def process_changes(d, changes, require_existing=True):
    require(isinstance(changes, dict), 'settings must be an object.')
    result = dict(d)
    for key, value in changes.items():
        require(isinstance(value, str), f'{key}: Bambu scalar settings must be JSON strings.')
        require(not require_existing or key in d, f'{key}: not in this project configuration.')
        if key in INTEGER_SETTINGS:
            require(re.fullmatch(r'\d+', value) is not None, f'{key}: expected integer string.')
            lo, hi = INTEGER_SETTINGS[key]
            require(lo <= int(value) <= hi, f'{key}: out of supported range.')
        elif key in FLOAT_SETTINGS:
            lo, hi = FLOAT_SETTINGS[key]
            require(lo <= finite_number(value) <= hi, f'{key}: out of supported range.')
        elif key in BOOL_SETTINGS:
            require(value in ('0','1'), f'{key}: use string 0 or 1.')
        elif key in ENUM_SETTINGS:
            require(value in ENUM_SETTINGS[key], f'{key}: unsupported enum value {value!r}.')
        elif key == 'sparse_infill_density':
            require(value.endswith('%') and 0 <= finite_number(value[:-1]) <= 100,
                    'sparse_infill_density: expected 0% through 100%.')
        else:
            raise ProjectError(f'{key}: not a supported process edit. Keep printer/filament/G-code '
                               'profiles intact; make this change in Studio and save a new template.')
        result[key] = value
    for key in ('layer_height', 'initial_layer_print_height'):
        if key in changes and d.get('max_layer_height'):
            max_h = min(finite_number(v) for v in d['max_layer_height'] if v not in ('nil',''))
            require(finite_number(changes[key]) <= max_h, f'{key}: exceeds saved nozzle layer limit.')
    return result


def meta(parent, key, value):
    return ET.SubElement(parent, 'metadata', {'key': key, 'value': str(value)})


def is_toolpath(name):
    return re.search(r'\.(?:gcode|bgcode)(?:\.[^/]*)?$', name, re.I) is not None


def relationship_target(rels_path, target):
    """Resolve an OPC Target against the source part's directory, not the .rels file."""
    p = PurePosixPath(rels_path)
    require(p.parent.name == '_rels', f'Unexpected relationship member location: {rels_path}')
    base = str(p.parent.parent)
    target = unquote(target)
    require('\\' not in target, f'Invalid relationship target: {target}')
    resolved = posixpath.normpath(target.lstrip('/') if target.startswith('/')
                                 else posixpath.join(base,target))
    require(resolved not in ('.','..') and not resolved.startswith('../'),
            f'Relationship escapes the package: {target}')
    return resolved


def clear_generated_data(data, geometry_changed):
    removed = set()
    for n in list(data):
        leaf = PurePosixPath(n).name.lower()
        generated_image = re.fullmatch(r'Metadata/(?:plate_\d+(?:_small)?|plate_no_light_\d+|top_\d+|pick_\d+)\.(?:png|jpg|jpeg)', n, re.I)
        pattern_cache = re.fullmatch(r'Metadata/plate_\d+\.json', n, re.I)
        if is_toolpath(n) or n == 'Metadata/slice_info.config' or \
           n == 'Metadata/filament_sequence.json' or \
           pattern_cache or \
           re.match(r'Metadata/(?:slicedata|slice_data)/', n, re.I) or \
           (geometry_changed and n in ('Metadata/layer_height_profile.txt',
                                      'Metadata/layer_config_ranges.xml')) or \
           (geometry_changed and (generated_image or n in (
               'Metadata/cut_information.xml','Metadata/custom_gcode_per_layer.xml'))):
            removed.add(n)
            del data[n]
    for n in list(data):
        if n.endswith('.rels'):
            root = parse_xml(data[n], n)
            changed = False
            for rel in list(root):
                if rel.get('TargetMode') == 'External':
                    continue
                target = relationship_target(n,rel.get('Target',''))
                if target in removed or (geometry_changed and 'thumbnail' in rel.get('Type','').lower()):
                    root.remove(rel)
                    changed = True
            if changed:
                data[n] = xml_bytes(root)
    if '[Content_Types].xml' in data:
        root = parse_xml(data['[Content_Types].xml'], '[Content_Types].xml')
        changed = False
        for entry in list(root):
            if entry.get('PartName','').lstrip('/') in removed:
                root.remove(entry)
                changed = True
        if changed:
            data['[Content_Types].xml'] = xml_bytes(root)
    return sorted(removed)


def clean_plate_cache(conf, geometry_changed):
    cache_keys = {'gcode_file','gcode_file_md5','gcode_file_sha256','slice_result',
                  'prediction','weight','support_used','toolpath_outside',
                  'pattern_file','pattern_bbox_file'}
    image_keys = {'thumbnail_file','thumbnail_no_light_file','top_file','pick_file'}
    for plate in conf.findall('plate'):
        for element in list(plate):
            if element.tag == 'metadata' and (element.get('key') in cache_keys or
                    (geometry_changed and element.get('key') in image_keys)):
                plate.remove(element)
    return conf


def transform_vertices(vertices, transform):
    values = [finite_number(v) for v in transform.split()]
    require(len(values) == 12, '3MF transform must have 12 numbers.')
    a,b,c,d,e,f,g,h,i = values[:9]
    det = a*(e*i-f*h)-d*(b*i-c*h)+g*(b*f-c*e)
    require(math.isfinite(det) and det != 0, '3MF transform is singular or nonfinite.')
    result = [tuple(sum(v[j]*values[j*3+i] for j in range(3))+values[9+i]
                    for i in range(3)) for v in vertices]
    require(all(math.isfinite(c) for v in result for c in v), 'Transform overflows coordinates.')
    return result


def resolve_path(current, ref):
    if ref.startswith('/'):
        path = PurePosixPath(ref.lstrip('/'))
    else:
        path = PurePosixPath(current).parent / ref
    require('..' not in path.parts, 'Parent-relative component paths require Studio validation.')
    return str(path)


def validate_project(data, template_data=None, layout=False):
    d = settings(data)
    models, objects, checked = {}, {}, {}
    require('_rels/.rels' in data and '[Content_Types].xml' in data,
            'Missing package relationships or content types.')
    start_found = False
    for name,payload in data.items():
        if not name.endswith('.rels'):
            continue
        rels = parse_xml(payload,name)
        require(rels.tag == f'{{{RELS}}}Relationships', f'{name}: incorrect relationship namespace.')
        ids = [r.get('Id') for r in rels]
        require(len(ids) == len(set(ids)) and all(ids), f'{name}: duplicate/missing relationship IDs.')
        for rel in rels:
            if rel.get('TargetMode') == 'External':
                continue
            target = relationship_target(name,rel.get('Target',''))
            require(target in data, f'{name}: relationship points to missing {target}.')
            if name == '_rels/.rels' and rel.get('Type') == 'http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel':
                require(target == MODEL, 'This helper expects the main model at 3D/3dmodel.model.')
                start_found = True
    require(start_found, 'Missing root 3D model relationship.')
    content_types = parse_xml(data['[Content_Types].xml'],'[Content_Types].xml')
    require(content_types.tag == f'{{{CT}}}Types', 'Invalid content-types namespace.')
    require(any(e.get('Extension') == 'model' or e.get('PartName','').lstrip('/') == MODEL
                for e in content_types), 'Missing model content-type declaration.')
    for path, payload in data.items():
        if path.endswith('.model'):
            root = parse_xml(payload, path)
            require(root.get('unit','millimeter') == 'millimeter', 'Only millimeter models are supported.')
            core_children = [local(e.tag) for e in root if e.tag.startswith('{'+CORE+'}')]
            require(core_children.count('resources') == 1 and core_children.count('build') == 1 and
                    core_children == ['metadata']*core_children.count('metadata')+['resources','build'],
                    f'{path}: core model children must be metadata*, resources, build in that order.')
            models[path] = root
            entries = root.findall(f'{q("resources")}/{q("object")}')
            ids = [o.get('id') for o in entries]
            require(len(ids) == len(set(ids)), f'{path}: duplicate object IDs.')
            objects[path] = {o.get('id'): o for o in entries}
    require(MODEL in models, 'Missing main model.')

    descendants = {}

    def expand(path, oid, trail=()):
        key = (path, oid)
        require(key not in trail, 'Cyclic component graph.')
        require(path in objects and oid in objects[path], f'Unresolved object {path}#{oid}.')
        obj = objects[path][oid]
        mesh = obj.find(q('mesh'))
        if mesh is not None:
            if key not in checked:
                vs = [[finite_number(v.get(axis)) for axis in ('x','y','z')]
                      for v in mesh.findall(f'{q("vertices")}/{q("vertex")}')]
                ts = [[int(t.get(axis)) for axis in ('v1','v2','v3')]
                      for t in mesh.findall(f'{q("triangles")}/{q("triangle")}')]
                checked[key] = validate_mesh(vs, ts, f'{path}#{oid}')
            descendants[key] = {oid}
            return checked[key][0]
        components = obj.findall(f'{q("components")}/{q("component")}')
        require(components, f'{path}#{oid}: missing mesh/components.')
        vs = []
        descendant_ids = set()
        for c in components:
            target = resolve_path(path, c.get(f'{{{PROD}}}path')) if c.get(f'{{{PROD}}}path') else path
            vs += transform_vertices(expand(target, c.get('objectid'), trail+(key,)),
                                     c.get('transform', IDENTITY))
            descendant_ids.update(descendants[(target,c.get('objectid'))])
        descendants[key] = descendant_ids
        return vs

    builds, per_id = [], defaultdict(int)
    for item in models[MODEL].findall(f'{q("build")}/{q("item")}'):
        oid = item.get('objectid')
        points = transform_vertices(expand(MODEL, oid), item.get('transform', IDENTITY))
        bounds = bbox(points)
        if layout:
            check_bounds(bounds, d, f'object {oid}')
        builds.append({'object_id': oid, 'instance_id': per_id[oid], 'bounds_mm': bounds})
        per_id[oid] += 1
    conf = parse_xml(data[OBJECTS], OBJECTS)
    metadata_ids = [o.get('id') for o in conf.findall('object')]
    require(len(metadata_ids) == len(set(metadata_ids)), 'Duplicate object IDs in model settings.')
    for obj in conf.findall('object'):
        oid = obj.get('id')
        require(oid in per_id, f'Model settings refer to missing build object {oid}.')
        part_ids = [p.get('id') for p in obj.findall('part')]
        require(len(part_ids) == len(set(part_ids)) and all(
                pid in descendants[(MODEL,oid)] for pid in part_ids),
                f'Object {oid}: part metadata points to a missing/repeated mesh resource.')
    for item in conf.findall('assemble/assemble_item'):
        oid, iid = item.get('object_id'), int(item.get('instance_id','-1'))
        require(oid in per_id and 0 <= iid < per_id[oid], 'Assembly points to a missing build instance.')
        transform_vertices([(0,0,0)],item.get('transform',IDENTITY))
    plates = conf.findall('plate')
    require(plates, 'Missing plate metadata.')
    represented = []
    for plate in plates:
        for instance in plate.findall('model_instance'):
            m = {e.get('key'): e.get('value') for e in instance.findall('metadata')}
            oid, iid = m.get('object_id'), int(m.get('instance_id','-1'))
            require(oid in per_id and 0 <= iid < per_id[oid], 'Plate points to a missing build instance.')
            represented.append((oid, iid))
    if layout:
        require(len(plates) == 1, 'Layout validation supports one plate.')
        expected = {(b['object_id'], b['instance_id']) for b in builds}
        require(len(represented) == len(set(represented)) and set(represented) == expected,
                'Plate membership does not match the build list.')
        rects = [[b['bounds_mm'][0][0],b['bounds_mm'][0][1],
                  b['bounds_mm'][1][0],b['bounds_mm'][1][1]] for b in builds]
        require(not any(overlaps(a,b) for i,a in enumerate(rects) for b in rects[i+1:]),
                'Object bounding boxes overlap; use an explicit multipart workflow for assemblies.')
    report = {'status': 'structural_checks_passed', 'build_items': builds,
              'meshes': [dict(model=p, object_id=o, **v[2]) for (p,o),v in checked.items()],
              'layout_checked': layout,
              'contains_toolpaths': any(is_toolpath(n) for n in data),
              'not_checked': ['Bambu Studio load/slicing', 'self-intersections',
                  'wall thickness and fit', 'support/brim/prime tower clearance',
                  'sequential-print toolhead clearance']}
    if template_data is not None:
        old = settings(template_data)
        report['settings_changes'] = {k: {'before': old.get(k), 'after': d.get(k)}
                  for k in old.keys() | d.keys() if old.get(k) != d.get(k)}
        report['settings_bytes_unchanged'] = data[SETTINGS] == template_data[SETTINGS]
    return report


def create(template_path, manifest_path, output):
    data = read_archive(template_path)
    original_settings = data[SETTINGS]
    root = parse_xml(data[MODEL], MODEL)
    resources, build = root.find(q('resources')), root.find(q('build'))
    require(resources is not None and build is not None and not len(resources) and not len(build),
            'create requires a genuinely empty template. Existing geometry would be lost.')
    require(len([n for n in data if n.endswith('.model')]) == 1,
            'Empty template must contain exactly one model XML file.')
    require(root.get('unit','millimeter') == 'millimeter', 'Template must use millimeters.')
    conf = parse_xml(data[OBJECTS], OBJECTS)
    require(len(conf.findall('plate')) == 1 and not conf.findall('object'),
            'create supports an empty single-plate template.')
    manifest_path = Path(manifest_path).resolve()
    m = json.loads(manifest_path.read_text())
    require(m.get('schema_version') == 1, 'Manifest needs schema_version: 1.')
    allowed = {'schema_version','title','description','objects','settings','margin_mm','gap_mm'}
    require(not set(m)-allowed, f'Unknown manifest keys: {set(m)-allowed}')
    require(isinstance(m.get('objects'),list) and m['objects'], 'Manifest needs a nonempty objects list.')
    d = process_changes(settings(data), m.get('settings',{}))
    require(d.get('print_sequence', 'by layer') == 'by layer',
            'Use Studio for arranging by-object sequential prints.')
    if m.get('settings'):
        data[SETTINGS] = (json.dumps(d, ensure_ascii=False, indent=2)+'\n').encode()
    plate = conf.find('plate')
    require(not plate.findall('model_instance'), 'Empty template contains stale plate instances.')
    assemble = conf.find('assemble')
    if assemble is None:
        assemble = ET.SubElement(conf, 'assemble')
    require(not len(assemble), 'Empty template contains stale assembly entries.')
    margin, gap = finite_number(m.get('margin_mm', 10)), finite_number(m.get('gap_mm', 6))
    require(margin >= 0 and gap >= 0, 'margin_mm/gap_mm must be nonnegative.')
    bed, height, excluded = usable_bed(d)
    prepared = []
    for index, spec in enumerate(m['objects']):
        require(isinstance(spec,dict), 'Each object must be a JSON object.')
        require(not set(spec)-{'name','mesh','position_mm','rotate_z_degrees','filament','settings'},
                f'Unsupported object keys: {set(spec)-{"name","mesh","position_mm","rotate_z_degrees","filament","settings"}}')
        name = spec.get('name', f'Part {index+1}')
        require(isinstance(name,str) and name.strip(), 'Object name must be nonempty.')
        vertices, triangles, stats = read_mesh(spec.get('mesh'), manifest_path.parent)
        angle = math.radians(finite_number(spec.get('rotate_z_degrees',0)))
        c, s = math.cos(angle), math.sin(angle)
        vertices = [(x*c-y*s, x*s+y*c, z) for x,y,z in vertices]
        lo, hi = bbox(vertices)
        vertices = [tuple(v[i]-lo[i] for i in range(3)) for v in vertices]
        size = [hi[i]-lo[i] for i in range(3)]
        slot = spec.get('filament',1)
        require(isinstance(slot,int) and not isinstance(slot,bool) and
                1 <= slot <= len(d.get('filament_settings_id',[])), 'Invalid 1-based filament slot.')
        overrides = spec.get('settings',{})
        process_changes(d, overrides)
        prepared.append(dict(name=name, vertices=vertices, triangles=triangles, size=size,
                             slot=slot, overrides=overrides, position=spec.get('position_mm')))
    placed = []
    # Reserve explicit positions first. Auto placement uses a rectangular shelf search.
    for item in [p for p in prepared if p['position'] is not None]:
        require(isinstance(item['position'],list) and len(item['position']) == 2,
                'position_mm must contain lower-left X and Y.')
        x,y = [finite_number(v) for v in item['position']]
        rectangle = check_bounds(([x,y,0],[x+item['size'][0],y+item['size'][1],item['size'][2]]),
                                 d, item['name'], margin)
        require(not any(overlaps(rectangle,r,gap) for r in placed), 'Explicit object positions overlap or violate gap.')
        item['xy'] = (x,y)
        placed.append(rectangle)
    for item in [p for p in prepared if p['position'] is None]:
        w,h,z = item['size']
        xs = sorted({bed[0]+margin} | {r[2]+gap for r in placed+excluded})
        ys = sorted({bed[1]+margin} | {r[3]+gap for r in placed+excluded})
        chosen = None
        for y in ys:
            for x in xs:
                rect = [x,y,x+w,y+h]
                try:
                    check_bounds(([x,y,0],[x+w,y+h,z]),d,item['name'],margin)
                except ProjectError:
                    continue
                if not any(overlaps(rect,r,gap) for r in placed):
                    chosen = (x,y,rect)
                    break
            if chosen:
                break
        require(chosen is not None, f'{item["name"]}: cannot arrange within the common nozzle area.')
        item['xy'] = chosen[:2]
        placed.append(chosen[2])
    build.set(f'{{{PROD}}}UUID', str(uuid.uuid4()))
    if not any(e.tag.startswith('{'+BBL+'}') or any(k.startswith('{'+BBL+'}') for k in e.attrib)
               for e in root.iter()):
        root.set('xmlns:BambuStudio', BBL)
    for i,item in enumerate(prepared):
        mid, oid = str(i*2+1), str(i*2+2)
        obj = ET.SubElement(resources,q('object'),{'id':mid,'type':'model',f'{{{PROD}}}UUID':str(uuid.uuid4())})
        mesh = ET.SubElement(obj,q('mesh'))
        vs, ts = ET.SubElement(mesh,q('vertices')), ET.SubElement(mesh,q('triangles'))
        for v in item['vertices']:
            ET.SubElement(vs,q('vertex'),{axis:fmt(v[j]) for j,axis in enumerate(('x','y','z'))})
        for t in item['triangles']:
            ET.SubElement(ts,q('triangle'),{axis:str(t[j]) for j,axis in enumerate(('v1','v2','v3'))})
        wrapper = ET.SubElement(resources,q('object'),{'id':oid,'type':'model',f'{{{PROD}}}UUID':str(uuid.uuid4())})
        components = ET.SubElement(wrapper,q('components'))
        ET.SubElement(components,q('component'),{'objectid':mid,'transform':IDENTITY,f'{{{PROD}}}UUID':str(uuid.uuid4())})
        transform = '1 0 0 0 1 0 0 0 1 '+fmt(item['xy'][0])+' '+fmt(item['xy'][1])+' 0'
        ET.SubElement(build,q('item'),{'objectid':oid,'transform':transform,'printable':'1',f'{{{PROD}}}UUID':str(uuid.uuid4())})
        ob = ET.Element('object',{'id':oid})
        conf.insert(i,ob)
        meta(ob,'name',item['name'])
        meta(ob,'extruder',item['slot'])
        for k,v in item['overrides'].items():
            meta(ob,k,v)
        part = ET.SubElement(ob,'part',{'id':mid,'subtype':'normal_part'})
        meta(part,'name',item['name'])
        meta(part,'matrix',MATRIX4)
        instance = ET.SubElement(plate,'model_instance')
        for k,v in (('object_id',oid),('instance_id','0'),('identify_id',str(i+1))):
            meta(instance,k,v)
        ET.SubElement(assemble,'assemble_item',{'object_id':oid,'instance_id':'0','transform':transform,'offset':'0 0 0'})
    for key,value in (('Title',m.get('title','Generated Bambu Studio project')),
                      ('Description',m.get('description','')),
                      ('ModificationDate',datetime.now(timezone.utc).date().isoformat())):
        require(isinstance(value,str), f'{key} must be text.')
        element = next((e for e in root.findall(q('metadata')) if e.get('name') == key),None)
        if element is None:
            element = ET.Element(q('metadata'),{'name':key})
            root.insert(list(root).index(resources),element)
        element.text = value
    # Keep the source Application version: this is a template-compatible draft, not a Studio roundtrip.
    removed = clear_generated_data(data, geometry_changed=True)
    data[MODEL] = xml_bytes(root)
    data[OBJECTS] = xml_bytes(clean_plate_cache(conf, geometry_changed=True))
    report = validate_project(data, read_archive(template_path), layout=True)
    require(not report['contains_toolpaths'], 'New geometry must not contain stale toolpaths.')
    require(bool(m.get('settings')) or data[SETTINGS] == original_settings,
            'Unexpected modification of template settings.')
    write_archive(data, output, template_path)
    report.update(output=str(Path(output).resolve()), removed_cached_members=removed)
    return report


def patch_settings(input_path, changes_path, output):
    data = read_archive(input_path)
    original = dict(data)
    changes = json.loads(Path(changes_path).read_text())
    new = process_changes(settings(data), changes)
    data[SETTINGS] = (json.dumps(new, ensure_ascii=False, indent=2)+'\n').encode()
    removed = clear_generated_data(data, geometry_changed=False)
    data[OBJECTS] = xml_bytes(clean_plate_cache(parse_xml(data[OBJECTS], OBJECTS),False))
    # Preserve all model XML bytes, paint data and arbitrary geometry/part metadata.
    require(all(data[n] == v for n,v in original.items() if n.endswith('.model')),
            'Geometry changed during a settings-only edit.')
    require(not any(is_toolpath(n) for n in data), 'Stale toolpaths remain.')
    report = {'output':str(Path(output).resolve()), 'status':'process_settings_patched',
              'geometry_bytes_unchanged':True, 'removed_cached_members':removed,
              'changes':{k:{'before':settings(original).get(k),'after':v} for k,v in changes.items()},
              'note':'Existing object/part overrides remain and can override global settings. Re-slice in Studio.'}
    write_archive(data, output, input_path)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    p = commands.add_parser('inspect', help='Print concise project/printer metadata; never print G-code profiles.')
    p.add_argument('input')
    p = commands.add_parser('create', help='Generate a one-plate unsliced project from an empty template.')
    p.add_argument('--template', default=str(TEMPLATE))
    p.add_argument('--manifest', required=True)
    p.add_argument('--output', required=True)
    p = commands.add_parser('validate', help='Validate mesh topology/IDs; optionally check one-plate bed bounds.')
    p.add_argument('input')
    p.add_argument('--template')
    p.add_argument('--layout', action='store_true')
    p = commands.add_parser('patch-settings', help='Change allowlisted global process settings; retain geometry.')
    p.add_argument('input')
    p.add_argument('--settings', required=True)
    p.add_argument('--output', required=True)
    args = parser.parse_args()
    try:
        if args.command == 'inspect':
            result = summary(read_archive(args.input))
        elif args.command == 'create':
            result = create(args.template,args.manifest,args.output)
        elif args.command == 'validate':
            result = validate_project(read_archive(args.input),
                    read_archive(args.template) if args.template else None, args.layout)
        else:
            result = patch_settings(args.input,args.settings,args.output)
        print(json.dumps(result,indent=2,ensure_ascii=False))
    except (ProjectError, OSError, ValueError, KeyError, TypeError, BadZipFile) as e:
        print(json.dumps({'error':str(e)},ensure_ascii=False),file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
