"""Original four-panel sample for testing sewing, not a graded production block."""
import json, math, sys
from pathlib import Path
import ezdxf

def sample():
    panels=[]
    for role in ['front','back']:
        pts=[[0,700],[550,700],[540,230],[480,65],[370,35]]
        for k in range(1,13):
            a=k/12*math.pi
            pts.append([270+100*math.cos(a),35+(90 if role=='front' else 30)*math.sin(a)])
        pts += [[60,65],[10,230]]
        panels.append({'id':'p'+str(len(panels)+1),'name':role,'layer':role,'points':pts,'widthMm':550,'heightMm':700,'areaMm2':335000,'role':role,'enabled':True,'offset':[0,0,0],'rotation':0})
    for role in ['left-sleeve','right-sleeve']:
        pts=[]
        for k in range(17):
            x=k/16*360
            pts.append([x,70-70*math.sin(k/16*math.pi)])
        pts += [[360,250],[0,250]]
        panels.append({'id':'p'+str(len(panels)+1),'name':role,'layer':role,'points':pts,'widthMm':360,'heightMm':250,'areaMm2':70000,'role':role,'enabled':True,'offset':[0,0,0],'rotation':0})
    seams=[]
    def sew(ap,ast,aend,bp,bst,bend,reverse=False):
        seams.append({'id':f's{len(seams)+1}','a':{'panelId':ap,'start':ast,'end':aend},'b':{'panelId':bp,'start':bst,'end':bend},'reverse':reverse})
    sew('p1',1,2,'p2',1,2)
    sew('p1',18,0,'p2',18,0)
    sew('p1',3,4,'p2',3,4)
    sew('p1',16,17,'p2',16,17)
    # right / left armholes, upper half sleeve caps.
    for body_start,body_end,sleeve in [(2,3,'p4'),(17,18,'p3')]:
        sew('p1',body_start,body_end,sleeve,0,8,body_start==17)
        sew('p2',body_start,body_end,sleeve,8,16,body_start!=17)
        sew(sleeve,16,17,sleeve,18,0,True)
    for p in panels:
        xmin=min(x for x,y in p['points']);ymin=min(y for x,y in p['points'])
        p['points']=[[x-xmin,y-ymin] for x,y in p['points']]
        p['widthMm']=max(x for x,y in p['points']);p['heightMm']=max(y for x,y in p['points'])
    return {'name':'DreamTeam / Training sample','panels':panels,'seams':seams,'fabric':'performance-knit','contourType':'sewing','particleMm':18,'frames':55,'avatar':{'chestMm':960,'waistMm':830,'heightMm':1800},'warnings':['Campione di sviluppo, non un cartamodello approvato per produzione.'],'sourceUnits':'mm','scaleToMm':1}

def write_dxf(filename):
    doc=ezdxf.new('R2010');doc.units=4
    for i,p in enumerate(sample()['panels']):
        doc.layers.new(p['role']);doc.modelspace().add_lwpolyline([(x+i*750,700-y) for x,y in p['points']],close=True,dxfattribs={'layer':p['role']})
    doc.saveas(filename)
if __name__=='__main__':
    out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
    write_dxf(out/'studio-jersey.dxf');(out/'studio-jersey.json').write_text(json.dumps(sample(),indent=2))
