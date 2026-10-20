"""Headless Blender sewing + cloth drape. Input: flat panels, explicit seams, placement.
No external add-on code is embedded; uses Blender's public cloth API.
"""
import bpy, bmesh, json, sys, math, time
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt
from mathutils.bvhtree import BVHTree
from pathlib import Path

args=sys.argv[sys.argv.index('--')+1:]; source=Path(args[0]); output=Path(args[1]); cfg=json.loads(source.read_text())
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.fps=30;scene.frame_end=150
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
particle=cfg.get('particleMm',18);panels=[p for p in cfg['panels'] if p.get('enabled',True)]
byid={p['id']:p for p in panels};seams=cfg['seams'];starttime=time.monotonic()

def chain(ref):
    p=byid[ref['panelId']]['points'];out=[];i=ref['start']
    while i!=ref['end']:
        j=(i+1)%len(p);out.append((i,j,math.dist(p[i],p[j])));i=j
        if len(out)>len(p):raise ValueError('Invalid seam range')
    return out

def at(ref,t):
    segments=chain(ref);total=sum(s[2] for s in segments);dist=t*total
    for i,j,length in segments:
        if dist<=length+1e-7:return (i,round(min(1,max(0,dist/length)),7))
        dist-=length
    return (segments[-1][0],1.0)

# Conforming seam samples are inserted into both boundaries before meshing.
params={p['id']:[set([0.0]) for _ in p['points']] for p in panels}; seam_markers=[]
for p in panels:
    for i,a in enumerate(p['points']):
        length=math.dist(a,p['points'][(i+1)%len(p['points'])]);n=max(1,math.ceil(length/particle))
        params[p['id']][i].update(round(k/n,7) for k in range(n))
for s in seams:
    ca,cb=chain(s['a']),chain(s['b']);la,lb=sum(x[2] for x in ca),sum(x[2] for x in cb)
    if min(la,lb)<1 or max(la,lb)/min(la,lb)>1.35:raise ValueError('Lunghezze di cucitura incompatibili (oltre 35%).')
    n=max(2,math.ceil(max(la,lb)/particle));markers=[]
    for k in range(n+1):
        a=at(s['a'],k/n);b=at(s['b'],1-k/n if s.get('reverse') else k/n)
        params[s['a']['panelId']][a[0]].add(a[1]);params[s['b']['panelId']][b[0]].add(b[1]);markers.append((a,b))
    seam_markers.append((s,markers))

verts=[];flatverts=[];faces=[];face_uv=[];face_material=[];markers_by_panel={};materials=[]
def place(p,x,y):
    w,h=p['widthMm']/1000,p['heightMm']/1000;role=p['role'];xx=x/1000;yy=y/1000
    if role in ['front','back']:
        a=(xx/w-.5)*math.pi;chest=cfg['avatar']['chestMm']/960
        rx=w/0.55*0.22;ry=w/0.55*0.126
        pos=Vector((math.sin(a)*rx,(-1 if role=='front' else 1)*math.cos(a)*ry,1.565*(cfg['avatar']['heightMm']/1800)-yy))
    elif role in ['left-sleeve','right-sleeve']:
        sign=-1 if role=='left-sleeve' else 1;angle=xx/w*2*math.pi-math.pi;radius=w/(2*math.pi);axial=yy-.025
        axis=Vector((sign*.91,0,-.415));up=Vector((sign*.415,0,.91))
        pos=Vector((sign*.205,0,1.48*(cfg['avatar']['heightMm']/1800)))+axis*axial+up*(math.cos(angle)*radius)+Vector((0,-math.sin(angle)*radius,0))
    else: raise ValueError('Ruolo del pannello non assegnato.')
    angle=math.radians(p.get('rotation',0));pos=Vector((math.cos(angle)*pos.x-math.sin(angle)*pos.y,math.sin(angle)*pos.x+math.cos(angle)*pos.y,pos.z))
    return pos+Vector([v/1000 for v in p.get('offset',[0,0,0])])

for pi,p in enumerate(panels):
    pts=p['points'];boundary=[];lookup={}
    for i,ts in enumerate(params[p['id']]):
        a,b=pts[i],pts[(i+1)%len(pts)]
        for t in sorted(ts):
            if t==1:continue
            lookup[(i,t)]=len(boundary);boundary.append(Vector(((a[0]+(b[0]-a[0])*t)/1000,(a[1]+(b[1]-a[1])*t)/1000)))
    # Segment endpoint markers resolve to the next original segment.
    for i,ts in enumerate(params[p['id']]):
        if 1.0 in ts:lookup[(i,1.0)]=lookup[((i+1)%len(pts),0.0)]
    coords=list(boundary);step=particle/1000
    def inside(x,y):
        hit=False
        for i,a in enumerate(pts):
            b=pts[(i+1)%len(pts)];ax,ay=a[0]/1000,a[1]/1000;bx,by=b[0]/1000,b[1]/1000
            if (ay>y)!=(by>y) and x<(bx-ax)*(y-ay)/(by-ay)+ax:hit=not hit
        return hit
    for row in range(1,math.ceil(p['heightMm']/(particle*.866))):
        y=row*step*.866
        for col in range(1,math.ceil(p['widthMm']/particle)):
            x=(col+(row%2)*.5)*step
            if inside(x,y):coords.append(Vector((x,y)))
    if len(coords)>12000:raise ValueError('Troppe particelle. Aumenta la distanza delle particelle.')
    edges=[(i,(i+1)%len(boundary)) for i in range(len(boundary))]
    vs,es,fs,orig,_,_=delaunay_2d_cdt(coords,edges,[tuple(range(len(boundary)))],1,1e-8,True)
    offset=len(verts);input_to_output={v:i+offset for i,ids in enumerate(orig) for v in ids}
    markers_by_panel[p['id']]={key:input_to_output[idx] for key,idx in lookup.items()}
    verts.extend(place(p,v.x*1000,v.y*1000) for v in vs)
    flatverts.extend(Vector((v.x+pi*3,v.y,0)) for v in vs)
    mat=bpy.data.materials.new(p['role']);mat.diffuse_color=(.38,.42,.44,1);materials.append(mat)
    for f in fs:
        faces.append(tuple(offset+i for i in f));face_material.append(pi)
        face_uv.append([((1-vs[i].x/(p['widthMm']/1000)) if p['role']=='back' else vs[i].x/(p['widthMm']/1000),1-vs[i].y/(p['heightMm']/1000)) for i in f])

pairs=[]
for s,markers in seam_markers:
    for a,b in markers:
        ia=markers_by_panel[s['a']['panelId']][a];ib=markers_by_panel[s['b']['panelId']][b]
        if ia!=ib:pairs.append((ia,ib))
mesh=bpy.data.meshes.new('DXF sewn panels');mesh.from_pydata(verts,list(set(tuple(sorted(p)) for p in pairs)),faces);mesh.update()
garment=bpy.data.objects.new('DreamTeam / simulated garment',mesh);bpy.context.collection.objects.link(garment)
for mat in materials:mesh.materials.append(mat)
uv=mesh.uv_layers.new(name='Pattern millimetres')
for poly,coords,mat in zip(mesh.polygons,face_uv,face_material):
    poly.material_index=mat;poly.use_smooth=True
    for li,coord in zip(poly.loop_indices,coords):uv.data[li].uv=coord

# Original parametric fitting bust; no third-party avatar assets or licences.
bodyparts=[];chest=cfg['avatar']['chestMm']/960;he=cfg['avatar']['heightMm']/1800
# Height currently controls the torso landmark positions; other proportions use chest/waist.
def ellipsoid(name,loc,scale):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=24,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);bodyparts.append(o);return o
ellipsoid('Torso',(0,0,1.20),(.18*chest,.103*chest,.34))
ellipsoid('Chest',(0,0,1.42),(.204*chest,.112*chest,.18))
ellipsoid('Hip',(0,0,.94),(.18*cfg['avatar']['waistMm']/830,.10,.18))
ellipsoid('Neck',(0,0,1.59),(.059,.058,.12))
for sign in [-1,1]:
    a=Vector((sign*.185,0,1.49));b=Vector((sign*.67,0,1.27));delta=b-a
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=20,location=(a+b)/2);o=bpy.context.object;o.name='Arm';o.scale=(.049*chest,.052*chest,delta.length/2+.05);o.rotation_euler=delta.to_track_quat('Z','Y').to_euler();bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);bodyparts.append(o)
bpy.ops.object.select_all(action='DESELECT')
for o in bodyparts:o.select_set(True)
bpy.context.view_layer.objects.active=bodyparts[0];bpy.ops.object.join();body=bpy.context.object;body.name='Avatar / fitting bust'
rem=body.modifiers.new('Unified collider','REMESH');rem.mode='VOXEL';rem.voxel_size=.012;bpy.ops.object.modifier_apply(modifier=rem.name)
sm=body.modifiers.new('Smooth collider','SMOOTH');sm.factor=1.2;sm.iterations=5;bpy.ops.object.modifier_apply(modifier=sm.name)
for poly in body.data.polygons:poly.use_smooth=True
body.scale.z=he;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
body.modifiers.new('Body collision','COLLISION');body.collision.thickness_outer=.003;body.collision.thickness_inner=.001
bodymat=bpy.data.materials.new('Fitting bust');bodymat.diffuse_color=(.16,.18,.20,1);body.data.materials.append(bodymat)

# Bring paired boundary samples into a collision-safe sewing arrangement.
# Only boundary particles move; the 2D mesh remains the cloth rest metric.
bpy.context.view_layer.objects.active=body;body.select_set(True);garment.select_set(False)
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
bvh=BVHTree.FromObject(body,bpy.context.evaluated_depsgraph_get())
parents=list(range(len(mesh.vertices)))
def root(i):
    while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
    return i
for a,b in pairs:parents[root(b)]=root(a)
groups={}
for a,b in pairs:
    for i in [a,b]:groups.setdefault(root(i),set()).add(i)
initial_gap=max((mesh.vertices[a].co-mesh.vertices[b].co).length for a,b in pairs)
if initial_gap>.5:raise ValueError('Disposizione troppo distante: correggi posizione e orientamento dei pannelli.')
for ids in groups.values():
    target=sum((mesh.vertices[i].co for i in ids),Vector())/len(ids)
    nearest,normal,_,distance=bvh.find_nearest(target)
    if nearest is not None and (target-nearest).dot(normal)<.006:target=nearest+normal*.007
    for k,i in enumerate(sorted(ids)):mesh.vertices[i].co=target+Vector((0,(k%2*2-1)*.0005,0))
mesh.update()

bpy.context.view_layer.objects.active=garment;garment.select_set(True);body.select_set(False)
garment.shape_key_add(name='Basis')
rest_key=garment.shape_key_add(name='DXF flat rest metric')
for v,co in zip(rest_key.data,flatverts):v.co=co
rest_key.value=0
def cloth(sewing):
    mod=garment.modifiers.new('Cloth / seam assembly' if sewing else 'Cloth / settle','CLOTH');s=mod.settings;s.quality=12;s.mass=.16;s.tension_stiffness=24;s.compression_stiffness=20;s.shear_stiffness=10;s.bending_stiffness=(.5 if cfg['fabric']=='performance-knit' else 1.2);s.air_damping=3
    s.rest_shape_key=rest_key if sewing else None
    s.use_sewing_springs=sewing;s.sewing_force_max=0
    c=mod.collision_settings;c.use_collision=True;c.distance_min=.003;c.collision_quality=4;c.use_self_collision=not sewing;c.self_distance_min=.003;c.self_friction=5
    mod.point_cache.frame_start=scene.frame_current;mod.point_cache.frame_end=scene.frame_current+100
    return mod
pin=garment.vertex_groups.new(name='Neck support')
pin.add([v.index for v in mesh.vertices if v.co.z>1.55 and abs(v.co.x)<.14],1.0,'REPLACE')
scene.frame_set(1);scene.gravity=(0,0,-.3);mod=cloth(True)
mod.settings.vertex_group_mass=pin.name;mod.settings.pin_stiffness=25
for frame in range(1,46):
    scene.frame_set(frame);bpy.context.view_layer.update();ev=garment.evaluated_get(bpy.context.evaluated_depsgraph_get());ev.to_mesh();ev.to_mesh_clear()
    if frame%5==0:print('PROGRESS '+json.dumps({'phase':'sewing','frame':frame,'total':75}),flush=True)
# Apply the simulated positions, remove loose spring edges and weld paired seam vertices.
deps=bpy.context.evaluated_depsgraph_get();evaluated=garment.evaluated_get(deps);snapshot=bpy.data.meshes.new_from_object(evaluated,depsgraph=deps);garment.modifiers.clear();garment.data=snapshot
maxgap=max((snapshot.vertices[a].co-snapshot.vertices[b].co).length for a,b in pairs)
for seam,marks in seam_markers:
    gaps=[(snapshot.vertices[markers_by_panel[seam['a']['panelId']][a]].co-snapshot.vertices[markers_by_panel[seam['b']['panelId']][b]].co).length for a,b in marks]
    print('SEAM',seam['id'],round(max(gaps)*1000,2),flush=True)
bm=bmesh.new();bm.from_mesh(snapshot);bm.verts.ensure_lookup_table();target={};welded=0
for a,b in pairs:
    va,vb=bm.verts[a],bm.verts[b]
    if va==vb:continue
    if (va.co-vb.co).length<.035:
        target[vb]=va;welded+=1
# Resolve duplicate mappings / transitive seam corner links before weld.
for v in list(target):
    t=target[v];seen={v}
    while t in target and t not in seen:seen.add(t);t=target[t]
    if t==v:del target[v]
    else:target[v]=t
bmesh.ops.delete(bm,geom=[e for e in bm.edges if not e.link_faces],context='EDGES')
bmesh.ops.weld_verts(bm,targetmap=target);bm.to_mesh(snapshot);bm.free();snapshot.update()
scene.frame_set(47);scene.gravity=(0,0,-9.81);mod=cloth(False)
for frame in range(47,77):
    scene.frame_set(frame);bpy.context.view_layer.update();ev=garment.evaluated_get(bpy.context.evaluated_depsgraph_get());ev.to_mesh();ev.to_mesh_clear()
    if frame%5==0:print('PROGRESS '+json.dumps({'phase':'settling','frame':frame-1,'total':75}),flush=True)
evaluated=garment.evaluated_get(bpy.context.evaluated_depsgraph_get());final=bpy.data.meshes.new_from_object(evaluated,depsgraph=bpy.context.evaluated_depsgraph_get());garment.modifiers.clear();garment.data=final
for v in final.vertices:
    if not all(math.isfinite(x) and abs(x)<5 for x in v.co):raise ValueError('Simulazione instabile. Controlla disposizione e cuciture.')
for poly in final.polygons:poly.use_smooth=True
sub=garment.modifiers.new('Render subdivision','SUBSURF');sub.levels=1;sub.render_levels=1
solid=garment.modifiers.new('Fabric thickness','SOLIDIFY');solid.thickness=.00065;solid.offset=0
# Export exactly the cloth result; avatar is available as optional display mesh.
bpy.ops.object.select_all(action='DESELECT');garment.select_set(True);body.select_set(True);bpy.context.view_layer.objects.active=garment
output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_materials='EXPORT')
report={'engine':'Blender '+bpy.app.version_string,'source':'DXF panels + explicit seam graph','vertices':len(final.vertices),'triangles':sum(max(0,len(p.vertices)-2) for p in final.polygons),'seamPairs':len(pairs),'weldedPairs':welded,'initialArrangementGapMm':round(initial_gap*1000,2),'maxSeamGapMm':round(maxgap*1000,2),'durationSeconds':round(time.monotonic()-starttime,2),'warnings':[]}
if maxgap>.035:report['warnings'].append('Alcune cuciture non sono chiuse entro 35 mm: il capo richiede revisione.')
if welded<len(pairs)*.9:report['warnings'].append('Meno del 90% dei campioni di cucitura è stato saldato.')
report['warnings'].append('Materiale e avatar di sviluppo non calibrati su tessuto e corporatura reali. Non è una verifica certificata di vestibilità.')
output.with_suffix('.report.json').write_text(json.dumps(report,indent=2));print('RESULT '+json.dumps(report),flush=True)
