"""Importación reproducible sin dependencias. Solo staging; nunca publica.
Uso: python scripts/importar-wikipedia.py --html original.html --today AAAA-MM-DD
El original se descarga aparte para respetar caché/errores HTTP y se archiva exacto.
"""
from html.parser import HTMLParser
from pathlib import Path
from collections import Counter, defaultdict
from urllib.parse import urlparse, urljoin
import argparse, datetime as dt, hashlib, json, re, os

URL='https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Spanish_general_election'
LICENSE='https://creativecommons.org/licenses/by-sa/4.0/'
PARTIES={'PP':'PP','PSOE':'PSOE','Vox':'VOX','Sumar':'SUMAR','ERC':'ERC','Junts':'JUNTS','EH Bildu':'EH_BILDU','PNV':'PNV','BNG':'BNG','CCa':'CC','UPN':'UPN','Podemos':'PODEMOS','Se Acabó La Fiesta':'SALF','Aliança.cat':'ALIANCA_CAT','Adelante Andalucía (2021)':'ADELANTE_ANDALUCIA','FA':'FA','FV':'FV'}
MONTHS={m:i+1 for i,m in enumerate('Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split())}
ALIASES={'SocioMétrica':'SocioMétrica','Sociométrica':'SocioMétrica','EM Analytics':'EM-Analytics','IMOP Insights':'IMOP','SigmaDOS':'Sigma Dos','GAD 3':'GAD3','NC-Report':'NC Report','40dB.':'40dB','40dB.':'40dB'}

class Node:
 def __init__(self,tag='',attrs=(),parent=None): self.tag=tag; self.a=dict(attrs); self.children=[]; self.parent=parent
 def text(self): return ''.join(c if isinstance(c,str) else c.text() for c in self.children)
 def all(self,tag=None):
  for c in self.children:
   if isinstance(c,Node):
    if tag is None or c.tag==tag: yield c
    yield from c.all(tag)
class Parser(HTMLParser):
 def __init__(self,s):
  super().__init__(convert_charrefs=True); self.root=Node(); self.stack=[self.root]; self.feed(s)
 def handle_starttag(self,t,a):
  n=Node(t,a,self.stack[-1]); self.stack[-1].children.append(n)
  if t not in ['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']: self.stack.append(n)
 def handle_startendtag(self,t,a):
  self.handle_starttag(t,a)
  if self.stack[-1].tag==t: self.handle_endtag(t)
 def handle_endtag(self,t):
  for i in range(len(self.stack)-1,0,-1):
   if self.stack[i].tag==t: self.stack=self.stack[:i]; break
 def handle_data(self,s): self.stack[-1].children.append(s)

def clean(n):
 if isinstance(n,str): return n
 if n.tag in ['sup','style','script','small']: return ''
 if n.tag=='br': return '\n'
 if re.search(r'font-size\s*:\s*(?:75%|smaller)',n.a.get('style','')): return ''
 return ''.join(clean(c) for c in n.children)
def text(n): return re.sub(r'\s+',' ',clean(n)).strip()
def percentage(n):
 # Only the first line (vote share), never the smaller seat projection.
 value=clean(n).strip().split('\n')[0].strip()
 return float(value) if re.fullmatch(r'\d{1,2}(?:\.\d+)?|100(?:\.0+)?',value) else None
def date_iso(day,month,year):
 try: return dt.date(int(year),MONTHS[month[:3]],int(day)).isoformat()
 except (ValueError,KeyError): return None
def field_dates(s,year):
 s=re.sub(r'\s+',' ',s).strip().replace('−','–').replace('—','–')
 # A single table date is still fieldwork, unless explicitly marked as publication.
 m=re.fullmatch(r'(\d{1,2})(?: (\w+))?(?: (20\d{2}))?\s*[–-]\s*(\d{1,2}) (\w+)(?: (20\d{2}))?',s)
 if m:
  d1,mo1,y1,d2,mo2,y2=m.groups(); endyear=int(y2 or year); startyear=int(y1 or endyear)
  if not y1 and mo1 and MONTHS.get(mo1[:3],0)>MONTHS.get(mo2[:3],0): startyear-=1
  return date_iso(d1,mo1 or mo2,startyear),date_iso(d2,mo2,endyear)
 m=re.fullmatch(r'(\d{1,2}) (\w+)(?: (20\d{2}))?',s)
 if m:
  value=date_iso(m[1],m[2],m[3] or year); return value,value
 return None,None
def citation(n):
 cites=list(n.all('cite'))
 if not cites: return None
 c=cites[0]; links=[a for a in c.all('a') if 'external' in a.a.get('class','').split() and a.a.get('href','').startswith('https://')]
 # CS1 puts publication after the title. Ignore access/archive dates altogether.
 title=links[0] if links else None
 raw=text(c); tail=raw.split(text(title),1)[-1] if title else ''
 tail=re.split(r'Archived|Retrieved',tail)[0]
 dates=re.findall(r'\b(\d{1,2}) ([A-Z][a-z]+) (20\d{2})\b',tail)
 parsed=sorted(set(date_iso(*d) for d in dates)-{None})
 return {'url':title.a['href'] if title else None,'fecha_publicacion':parsed[0] if len(parsed)==1 else None,'texto':raw,'reference':n.a.get('id')}
def grid(table):
 pending={}
 for row in table.all('tr'):
  cells=[c for c in row.children if isinstance(c,Node) and c.tag in ['td','th']]
  occupied={k:v[0] for k,v in pending.items()}; pending={k:(v[0],v[1]-1) for k,v in pending.items() if v[1]>1}
  col=0
  for cell in cells:
   while col in occupied: col+=1
   span=int(cell.a.get('colspan','1')); rows=int(cell.a.get('rowspan','1'))
   for k in range(col,col+span):
    occupied[k]=cell
    if rows>1: pending[k]=(cell,rows-1)
   col+=span
  yield row,[occupied.get(k) for k in range(max(occupied,default=-1)+1)]
def parse(raw,today):
 root=Parser(raw.decode('utf8')).root
 oldids=[a.a.get('href','') for a in root.all('a') if 'oldid=' in a.a.get('href','')]
 if not oldids: raise ValueError('Sin revisión permanente')
 revision=urljoin(URL,oldids[0]); sha=hashlib.sha256(raw).hexdigest()
 if not any(n.a.get('href','').startswith(LICENSE) for n in root.all('link') if n.a.get('rel')=='license'): raise ValueError('Licencia no reconocida')
 refs={n.a['id']:citation(n) for n in root.all('li') if n.a.get('id','').startswith('cite_note-')}
 rows=[]; active=False; year=None; table_index=0
 for n in root.all():
  if n.tag=='h4': active=text(n)=='Voting intention estimates'
  if not active: continue
  if n.tag=='h5':
   m=re.match(r'20\d{2}',text(n)); year=int(m[0]) if m else None
  if n.tag!='table' or 'wikitable' not in n.a.get('class','') or not year: continue
  table_index+=1; expanded=list(grid(n)); headers=expanded[0][1]; columns={}
  for i,c in enumerate(headers):
   if c:
    titles=[a.a.get('title') for a in c.all('a')]
    if titles:
     if titles[0] not in PARTIES: raise ValueError('Columna de partido desconocida: '+str(titles[0]))
     columns[i]=PARTIES[titles[0]]
  if len(columns)<4: raise ValueError('Cabecera de tabla no reconocida')
  for ri,(node,cells) in enumerate(expanded[2:],2):
   if not cells or not cells[0] or cells[0].tag!='td': continue
   name=text(cells[0]); rawcells=[text(c) if c else None for c in cells]
   if 'election' in name.lower() or 'debate' in name.lower() or len(set(id(c) for c in cells if c))<5: continue
   institute=ALIASES.get(name.split('/')[0].strip(),name.split('/')[0].strip())
   citations=[]
   for a in cells[0].all('a'):
    ref=a.a.get('href','').split('#')[-1]
    if refs.get(ref): citations.append(refs[ref])
   citations=list({x['reference']:x for x in citations}.values())
   originals=[c for c in citations if c['url'] and not any(h in urlparse(c['url']).hostname for h in ['electografica.com','electograph.com'])]
   publications=sorted(set(c['fecha_publicacion'] for c in originals if c['fecha_publicacion']))
   start,end=field_dates(text(cells[1]),year)
   result={}
   for ci,party in columns.items():
    if ci<len(cells) and cells[ci] and int(cells[ci].a.get('colspan','1'))==1:
     v=percentage(cells[ci])
     if v is not None: result[party]=v
   sample=text(cells[2]).replace(',','')
   sample=int(sample) if sample.isdigit() and int(sample)>0 else None
   pub=publications[0] if publications else None
   identity='|'.join([institute,start or text(cells[1]),end or '',str(year)])
   p={'instituto':institute,'estudio_id':'wiki-'+hashlib.sha256(identity.encode()).hexdigest()[:20],'tipo':'estimacion_voto','ambito':'España','fecha_publicacion':pub,'trabajo_campo_inicio':start,'trabajo_campo_fin':end,'tamano_muestra':sample,'resultados':result,'fuente':next((c['url'] for c in originals if c['fecha_publicacion']==pub),originals[0]['url'] if originals else None),'referencias':citations,'ingestion':{'source':'wikipedia','revision':revision,'sha256':sha,'table':table_index,'row':ri,'row_id':node.a.get('id'),'raw_cells':rawcells,'publication_basis':'fecha bibliográfica explícita de la referencia; no inferida del campo' if pub else None,'license':LICENSE}}
   reasons=[]
   if institute=='CIS' or 'CIS' in institute: reasons.append('CIS: se conserva pipeline existente; no reimportar ni usar proyecciones alternativas')
   if institute in ['EM-Analytics','Electomanía']: reasons.append('Electopanel: metodología de panel/modelo pendiente de acreditar como encuesta representativa')
   if '/' not in name and institute not in ['CIS','GAD3','Sigma Dos','40dB','IMOP','NC Report','SocioMétrica','Ipsos','DYM','Sondaxe','GESOP','Hamalgama','Gizaker','Invymark','Metroscopia','Simple Lógica','Key Data','Celeste-Tel','Target Point','Ateneo del Dato','Ipsos']: reasons.append('Instituto o estudio interno sin identidad privada acreditada')
   if not originals: reasons.append('Sin enlace original independiente de Electográfica')
   if pub is None: reasons.append('Publicación no acreditada')
   if not end or not start: reasons.append('Campo ausente o ambiguo')
   if end and end<'2023-07-23': reasons.append('Anterior al 23J')
   if pub and (pub>today or end and end>pub): reasons.append('Orden temporal inválido o futuro')
   if not result or any(v<0 or v>100 for v in result.values()) or sum(result.values())>100.5: reasons.append('Resultados ausentes o suma inválida')
   p['quarantine_reasons']=reasons; p['missing']=[k for k in ['fecha_publicacion','trabajo_campo_inicio','trabajo_campo_fin','tamano_muestra'] if p[k] is None]
   rows.append(p)
 # Same house and field dates identifies syndication; conflicting rows all stay quarantined.
 groups=defaultdict(list)
 for p in rows: groups[p['estudio_id']].append(p)
 dedup=[]; duplicates=0
 for group in groups.values():
  distinct={json.dumps(p['resultados'],sort_keys=True) for p in group}
  samples={p['tamano_muestra'] for p in group if p['tamano_muestra'] is not None}
  if len(distinct)>1 or len(samples)>1:
   for p in group: p['quarantine_reasons'].append('Mismo instituto/campo con resultados distintos: revisión manual')
   dedup.extend(group)
  else:
   best=min(group,key=lambda p:(len(p['quarantine_reasons']),p['fecha_publicacion'] or '9999'))
   best['duplicates']=[{'table':p['ingestion']['table'],'row':p['ingestion']['row'],'referencias':p['referencias']} for p in group if p is not best]
   dedup.append(best); duplicates+=len(group)-1
 usable=sorted([p for p in dedup if not p['quarantine_reasons']],key=lambda p:(p['fecha_publicacion'],p['estudio_id']))
 quarantined=[p for p in dedup if p['quarantine_reasons']]
 attribution={'source':URL,'revision':revision,'history':URL+'?action=history','authors':'Wikipedia contributors','license':LICENSE,'modifications':'Tablas convertidas a JSON; partidos y fechas normalizados; referencias preservadas; filtros y cuarentena. No se han consultado feeds de Electográfica.','original_sha256':sha}
 report={'rows_read':len(rows),'deduplicated_records':len(dedup),'duplicates_removed':duplicates,'usable':len(usable),'quarantined':len(quarantined),'private_institutes':dict(Counter(p['instituto'] for p in usable)),'publication_interval':[min((p['fecha_publicacion'] for p in usable),default=None),max((p['fecha_publicacion'] for p in usable),default=None)],'field_interval':[min((p['trabajo_campo_fin'] for p in usable),default=None),max((p['trabajo_campo_fin'] for p in usable),default=None)],'parties':dict(Counter(k for p in usable for k in p['resultados'])),'original_hosts':dict(Counter(urlparse(p['fuente']).hostname for p in usable)),'quarantine_reasons':dict(Counter(r for p in quarantined for r in p['quarantine_reasons'])),'missing':dict(Counter(k for p in dedup for k in p['missing'])),'coverage_complete':False,'today':today,'attribution':attribution}
 return {'version':1,'encuestas':usable,'quarantine':quarantined,'report':report,'attribution':attribution}
def save(path,value):
 path=Path(path); path.parent.mkdir(parents=True,exist_ok=True)
 temporary=path.with_suffix('.tmp'); temporary.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf8'); os.replace(temporary,path)
def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--html',required=True); ap.add_argument('--today',required=True); args=ap.parse_args()
 dt.date.fromisoformat(args.today)
 raw=Path(args.html).read_bytes(); result=parse(raw,args.today)
 root=Path(os.environ.get('ELECTOGRAFICA_TEST_ROOT',Path(__file__).resolve().parents[1]))/'data/pipeline-test/wikipedia'; archive=root/'archive'/result['attribution']['original_sha256']; archive.mkdir(parents=True,exist_ok=True)
 original=archive/'original.html'
 if original.exists() and original.read_bytes()!=raw: raise ValueError('Original archivado distinto')
 if not original.exists(): original.write_bytes(raw)
 save(archive/'attribution.json',result['attribution']); save(root/'staging.json',result); save(root/'report.json',result['report'])
 save(root/'diagnostico-extraccion.json',{'validado':True,'etapa':'extraccion-wikipedia','sha256':result['attribution']['original_sha256'],'report':result['report'],'incidencias':[{'tipo':'cuarentena','estudio_id':p['estudio_id'],'evidencia':p['quarantine_reasons']} for p in result['quarantine']]})
 print(json.dumps(result['report'],ensure_ascii=False,indent=2))
if __name__=='__main__':
 try: main()
 except Exception as error:
  root=Path(os.environ.get('ELECTOGRAFICA_TEST_ROOT',Path(__file__).resolve().parents[1]))/'data/pipeline-test/wikipedia'
  save(root/'diagnostico-extraccion.json',{'validado':False,'incidencias':[{'tipo':'error','etapa':'extraccion','fuente':'wikipedia','codigo':'EXTRACCION_INVALIDA','evidencia':str(error)},{'tipo':'no_evaluable','codigo':'STAGING_NO_PROMOVIDO','evidencia':'No se sustituye el staging anterior'}]})
  raise
