"""Original authored 3D showroom jersey. Not a reconstruction of an uploaded DXF.
Continuous curved body, mounted sleeves, neck rib and textile-scale folds.
"""
import bpy, math, sys
from mathutils import Vector
from pathlib import Path
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
R,C=56,64

def bodypoint(u,v,back=False):
    width=.232+.006*math.sin(v*math.pi)-.035*max(0,(v-.73)/.27)
    x=u*width;z=.93+v*.625
    edge=abs(u);norm=math.sqrt(max(0,1-(x/.095)**2))
    ztop=1.575-(.022 if back else .073)*norm if abs(x)<=.095 else 1.575-(abs(x)-.095)*.25
    z+=(ztop-1.555)*v**7
    depth=.123-.014*math.sin(v*math.pi)
    y=depth*math.cos(u*math.pi/2)
    top_y=(.061 if back else .071)*norm if abs(x)<=.095 else 0
    y=y*(1-v**12)+top_y*v**12
    if v>.73:y+=.07*math.sin((v-.73)/.27*math.pi)*edge**12
    folds=(.004*math.sin(u*23+v*7)+.0022*math.sin(u*41-v*19))*(1-edge**5)*math.sin(v*math.pi)
    folds+=.003*math.sin(u*21+v*24)*math.exp(-((v-.12)/.18)**2)
    y+=folds
    z+=.003*math.sin(u*17)*max(0,1-v*8)
    return Vector((x,y if back else -y,z))

def create(name,verts,faces,uv):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();ob=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(ob)
    mat=bpy.data.materials.new(name);mat.diffuse_color=(.25,.30,.32,1);mesh.materials.append(mat)
    layer=mesh.uv_layers.new(name='Pattern UV')
    for p,tex in zip(mesh.polygons,uv):
        p.use_smooth=True
        for i,co in zip(p.loop_indices,tex):layer.data[i].uv=co
    solid=ob.modifiers.new('Fabric / 0.65 mm','SOLIDIFY');solid.thickness=.00065;solid.offset=0
    return ob

for back in [False,True]:
    verts=[bodypoint(-1+2*c/C,r/R,back) for r in range(R+1) for c in range(C+1)];faces=[];uv=[]
    for r in range(R):
        for c in range(C):
            ids=[r*(C+1)+c,r*(C+1)+c+1,(r+1)*(C+1)+c+1,(r+1)*(C+1)+c]
            tex=[(c/C,r/R),((c+1)/C,r/R),((c+1)/C,(r+1)/R),(c/C,(r+1)/R)]
            if back:ids.reverse();tex.reverse();tex=[(1-u,v) for u,v in tex]
            faces.append(ids);uv.append(tex)
    create('back' if back else 'front',verts,faces,uv)

for sign in [-1,1]:
    # Closed armhole boundary, shared with the body side curves.
    root=[];n=48
    for j in range(n):
        t=j/n
        if t<=.5:v=.73+2*t*.27;back=False
        else:v=1-(t-.5)*2*.27;back=True
        root.append(bodypoint(sign,v,back))
    center=sum(root,Vector())/n;axis=Vector((sign*.93,0,-.37));up=Vector((sign*.37,0,.93));verts=[];faces=[];uv=[];rows=22
    for r in range(rows+1):
        t=r/rows
        for j in range(n):
            a=-math.pi+j/n*2*math.pi
            cuff=center+axis*.255+up*(math.cos(a)*.074)+Vector((0,-math.sin(a)*.074,0))
            # Match cap phase to the armhole: bottom -> front -> top -> back.
            radial=(root[j]-center)
            angle=math.atan2(-radial.y,radial.dot(up));cuff=center+axis*.255+up*math.cos(angle)*.074+Vector((0,-math.sin(angle)*.074,0))
            p=root[j].lerp(cuff,t);p+=up*(.0025*math.sin(j*.8+t*13)*math.sin(t*math.pi));verts.append(p)
    for r in range(rows):
        for j in range(n):
            k=(j+1)%n;faces.append([r*n+j,r*n+k,(r+1)*n+k,(r+1)*n+j]);uv.append([(j/n,1-r/rows),((j+1)/n,1-r/rows),((j+1)/n,1-(r+1)/rows),(j/n,1-(r+1)/rows)])
    create('left-sleeve' if sign<0 else 'right-sleeve',verts,faces,uv)
# Rib neck strip follows the actual cut neckline, not a flat decal.
verts=[];faces=[];uv=[];n=120
for r in range(4):
    t=r/3
    for j in range(n):
        a=j/n*2*math.pi;x=.095*math.cos(a);back=math.sin(a)>0;y=(.061 if back else .071)*math.sin(a);z=1.575-(.022 if back else .073)*abs(math.sin(a));rad=1+t*.08
        verts.append((x*rad,y*rad,z-t*.011+.001))
for r in range(3):
    for j in range(n):
        k=(j+1)%n;faces.append([r*n+j,r*n+k,(r+1)*n+k,(r+1)*n+j]);uv.append([(j/n,r/3),((j+1)/n,r/3),((j+1)/n,(r+1)/3),(j/n,(r+1)/3)])
create('collar',verts,faces,uv)
output=Path(sys.argv[sys.argv.index('--')+1]);output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_apply=True,export_yup=True,use_selection=True)
