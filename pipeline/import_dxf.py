"""DXF geometry extraction. No sewing relationships or units are guessed."""
import json, sys, math
import ezdxf
from ezdxf import path, disassemble, units

def extract(filename, unit_override=None):
    doc = ezdxf.readfile(filename)
    unit_code = doc.units
    factors = {'mm': 1.0, 'cm': 10.0, 'm': 1000.0, 'in': 25.4}
    if unit_override:
        scale = factors[unit_override]
    elif unit_code:
        scale = units.conversion_factor(unit_code, units.MM)
    else:
        raise ValueError('DXF senza unità: seleziona esplicitamente mm, cm, m o pollici.')
    panels, ignored, warnings = [], {}, []
    for n, entity in enumerate(disassemble.recursive_decompose(doc.modelspace())):
        if n > 100000: raise ValueError('Il DXF supera il limite di 100.000 entità.')
        kind = entity.dxftype()
        if kind not in ('LWPOLYLINE', 'POLYLINE', 'SPLINE', 'CIRCLE', 'ELLIPSE'):
            ignored[kind] = ignored.get(kind, 0) + 1
            continue
        try:
            curve = path.make_path(entity)
            if not curve.is_closed:
                ignored['open-contour'] = ignored.get('open-contour', 0) + 1
                continue
            coords = [[float(p.x)*scale, float(p.y)*scale, float(p.z)*scale] for p in curve.flattening(0.4/scale, segments=4)]
            if coords and max(p[2] for p in coords)-min(p[2] for p in coords) > 0.01:
                warnings.append('Un contorno non planare è stato escluso.'); continue
            pts = []
            for x,y,_ in coords:
                if not all(math.isfinite(c) and abs(c) < 1e7 for c in [x,y]): raise ValueError('Coordinate fuori limite.')
                if not pts or math.dist(pts[-1], [x,y]) > 0.01: pts.append([x,y])
            if len(pts)>1 and math.dist(pts[0],pts[-1])<0.01: pts.pop()
            if len(pts)<3 or len(pts)>2000: continue
            xmin,ymin=min(p[0] for p in pts),min(p[1] for p in pts)
            xmax,ymax=max(p[0] for p in pts),max(p[1] for p in pts)
            w,h=xmax-xmin,ymax-ymin
            if w<10 or h<10: ignored['small-contour']=ignored.get('small-contour',0)+1; continue
            if max(w,h)>2500: raise ValueError('Pannello oltre 2500 mm: controlla le unità.')
            # Y-down coordinates match the flat workbench and texture UV convention.
            pts=[[round(x-xmin,4),round(ymax-y,4)] for x,y in pts]
            area=abs(sum(pts[i][0]*pts[(i+1)%len(pts)][1]-pts[(i+1)%len(pts)][0]*pts[i][1] for i in range(len(pts)))/2)
            if area<100: continue
            panels.append({'id':f'p{len(panels)+1}','name':entity.dxf.layer,'layer':entity.dxf.layer,'points':pts,'widthMm':round(w,4),'heightMm':round(h,4),'areaMm2':round(area,2),'role':'unassigned','enabled':True,'offset':[0,0,0],'rotation':0})
        except (TypeError, NotImplementedError): ignored[kind]=ignored.get(kind,0)+1
    if not panels: raise ValueError('Nessun contorno chiuso utilizzabile. Esporta i pannelli come POLYLINE/LWPOLYLINE o SPLINE chiuse. Le linee separate non vengono unite automaticamente.')
    if len(panels)>32: raise ValueError('Più di 32 contorni: esporta una taglia e i soli pannelli necessari, senza nesting o grading sovrapposto.')
    if ignored: warnings.append('Entità escluse: '+', '.join(f'{k}: {v}' for k,v in ignored.items()))
    warnings.append('Fori, tacche, drittofilo, grading e metadati AAMA/ASTM non sono interpretati. Curve approssimate con tolleranza 0,4 mm. Conferma il layer della linea di cucitura.')
    return {'panels':panels,'sourceUnits':unit_override or units.unit_name(unit_code),'scaleToMm':scale,'warnings':warnings}

if __name__=='__main__':
    try: print(json.dumps(extract(sys.argv[1],sys.argv[2] if len(sys.argv)>2 and sys.argv[2]!='auto' else None)))
    except Exception as e: print(json.dumps({'error':str(e)})); sys.exit(1)
