"""Auditoría por registro. No publica ni modifica el radar de producción.
Requiere staging Wikipedia archivado, originales y OCR local de sus fichas.
"""
import json,re,hashlib,datetime as dt,collections
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'data/pipeline-test/wikipedia'
st=json.loads((root/'staging.json').read_text(encoding='utf8'))
em={e['id']:e for e in json.loads((root/'em-evidence.json').read_text(encoding='utf8'))}
ix={e['url']:e for e in json.loads((root/'fichas/index.json').read_text())}
months={m:i+1 for i,m in enumerate('enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre'.split())}
def spanish_range(text,year):
 seg=re.search(r'(?:campo|recogida de datos)\s*:\s*(?:del?\s*)?(.{0,125})',text,re.I)
 if not seg:return None
 s=seg[1].lower()
 numeric=re.match(r'(\d{1,2})/(\d{1,2})/(20\d{2})\s*(?:al|a|[-–])\s*(\d{1,2})/(\d{1,2})/(20\d{2})',s)
 try:
  if numeric:
   a,b,y,c,d,z=map(int,numeric.groups());return dt.date(y,b,a).isoformat(),dt.date(z,d,c).isoformat()
  pattern=r'(\d{1,2})(?:\s+(?:de\s+)?([a-z]+))?(?:\s+(?:de\s+)?(20\d{2}))?\s*(?:al|a|[-–])\s*(\d{1,2})\s+(?:de\s+)?([a-z]+)(?:\s+(?:de\s+)?(20\d{2}))?'
  m=re.match(pattern,s)
  if m:
   a,b,y,c,d,z=m.groups();ey=int(z or year);sy=int(y or ey)
   b=b or d
   if not y and months[b]>months[d]:sy-=1
   return dt.date(sy,months[b],int(a)).isoformat(),dt.date(ey,months[d],int(c)).isoformat()
 except (ValueError,KeyError):pass
 return None
def original(p):
 key=hashlib.sha256(p['fuente'].encode()).hexdigest()
 f=root/'primary'/f'{key}.json'
 return json.loads(f.read_text(encoding='utf8')) if f.exists() else {}
def evidence(p):
 e=original(p)
 return [{'url':e['url'],'sha256':e['sha256'],'retrieved_at':e['retrieved_at'],'status':e['status']}] if e.get('status')==200 else []
accepted=[];audit=[]
for raw in st['encuestas']+st['quarantine']:
 p=json.loads(json.dumps(raw));name=p['instituto'];reasons=list(p['quarantine_reasons']);proof=evidence(p)
 method={'tipo':'encuesta con muestra propia; diseño según fuente original'}
 if name=='EM-Analytics':
  e=em[p['estudio_id']];matches=[];checked=[]
  sources=[(p['fuente'],e['text'],None)]
  for u in e['images'] or e['all_images']:
   full=re.sub(r'-\d+x\d+(?=\.)','',u);item=ix.get(full)
   if not item or item['status']!=200:continue
   file=root/'fichas'/item['name'];ocr=Path(str(file)+'.txt')
   if ocr.exists():sources.append((full,ocr.read_text(encoding='utf-8-sig'),file))
  for u,t,f in sources:
   dates=spanish_range(t,int(p['trabajo_campo_fin'][:4]));checked.append({'url':u,'field':dates})
   if dates and dates[1]==p['trabajo_campo_fin'] and re.search('cuestionario online|formulario online|CAWI|CAW/',t,re.I) and re.search('españa|nacional',t,re.I):
    matches.append((u,t,f,dates))
  # Ficha aportada por el usuario y contrastada visualmente, no inferida del título.
  if p['estudio_id']=='wiki-0281fb7b37ea5499e8df':
   matches.append(('https://electomania.es/electopanel-13ag-adelanto-baja-vox-minimos-para-erc/','Ficha 13/08/2023 aportada: recogida 5–11 agosto 2023; formulario online; libre participación; estratificación.',root/'fichas/usuario-electopanel-2023-08-13.png',('2023-08-05','2023-08-11')))
  reasons=[r for r in reasons if not r.startswith('Electopanel:')]
  if not proof:reasons.append('Publicación original no recuperable')
  if not matches:reasons.append('Ficha propia ausente o fechas de campo no concordantes; revisión pendiente')
  else:
   u,t,f,dates=matches[0]
   p['campo_tabla_original']={'inicio':p['trabajo_campo_inicio'],'fin':p['trabajo_campo_fin']}
   p['trabajo_campo_inicio'],p['trabajo_campo_fin']=dates
   sample_match=re.search(r'(?:tamaño (?:de la |de |)muestra|tamaño muestral)\s*:\s*([\d., ]+)\s*(?:cuestionarios|entrevistas|respuestas)',t,re.I)
   if sample_match:
    primary_sample=int(re.sub(r'\D','',sample_match[1]))
    if p['tamano_muestra']!=primary_sample:
     p['muestra_tabla_original']=p['tamano_muestra'];p['tamano_muestra']=None
     p['muestra_basis']='Discordancia entre lectura OCR de la ficha y muestra de tabla secundaria. Se conserva la evidencia y se deja n ausente hasta conciliación; no interviene en mediana.'
   if p['estudio_id']=='wiki-0281fb7b37ea5499e8df':
    p['muestra_tabla_original']=p['tamano_muestra'];p['tamano_muestra']=None
    p['muestra_basis']='Ficha aportada: 9.023 respuestas completas, 1.126 panelistas fijos y 1.305 nuevos; no son aditivos. Tabla secundaria: 1.305. Total no conciliado; n no interviene en mediana.'
   proof.append({'url':u,'sha256':hashlib.sha256(f.read_bytes()).hexdigest() if f else proof[0]['sha256'],'tipo':'ficha técnica propia','campo_verificado':list(dates),'ocr_local':str(f.relative_to(root))+'.txt' if f else None})
   method={'tipo':'panel online voluntario ponderado','muestra_propia':True,'probabilistica':False,'tracking':True,'limitacion':'Autoselección y participantes recurrentes; no equiparar a muestreo probabilístico. Sin ponderación por n en la mediana.'}
  p['auditoria_fichas']=checked
 elif name=='More in Common':
  reasons=[r for r in reasons if not r.startswith('Instituto o estudio interno')]
  if not proof:reasons.append('Sin publicación original verificada')
  method={'tipo':'encuesta CAWI propia con modelo de estimación','muestra_propia':True,'probabilistica':False}
 elif not p['fecha_publicacion']:
  if proof and name=='Sigma Dos':
   reasons=[r for r in reasons if r!='Publicación no acreditada']
   html=(root/'primary'/(hashlib.sha256(p['fuente'].encode()).hexdigest()+'.html')).read_text(encoding='utf8',errors='replace')
   published=re.search(r'property="article:published_time" content="(\d{4}-\d{2}-\d{2})T',html)
   if published:
    p['fecha_publicacion_tabla_original']=None;p['fecha_publicacion']=published[1]
    p['publicacion_basis']='Metadato article:published_time de publicación original archivada; coincide con datePublished JSON-LD.'
 elif name=='InvyMark':
  # La misma noticia de noviembre muestra una sola oleada; no valida el valor de octubre.
  if p['estudio_id'] in ['wiki-12e45b738ba1c601332d','wiki-6f288a5f1cbdbc3afd9b','wiki-a9de3b6d8de931d32c82']:reasons.append('Referencia compartida con otra oleada; publicación y campo de la oleada anterior requieren una referencia propia')
 # Las heurísticas por nombre no autorizan CIS reestimado ni encuestas internas.
 p.update(fecha_fin_campo=p['trabajo_campo_fin'],tipo_fecha='publicacion' if p['fecha_publicacion'] else 'fin_campo',publicacion_verificada=bool(proof) or not reasons,evidencia_publica=proof,metodologia=method)
 p['quarantine_reasons']=reasons
 category='CIS reestimado sin muestra nueva' if name.startswith('CIS (') else 'CIS: canal oficial existente' if name=='CIS' else 'panel online propio' if name=='EM-Analytics' else 'encuesta CAWI propia con estimación' if name=='More in Common' else 'estudio interno o sin identidad acreditada' if any('Instituto o estudio interno' in r for r in reasons) else 'encuesta privada'
 audit.append({'estudio_id':p['estudio_id'],'instituto':name,'tipo_metodologico':category,'nivel_evidencia':'original recuperado + tabla con atribución' if proof else 'tabla Wikipedia archivada y referencias; sin nuevo cotejo primario','fecha_publicacion':p['fecha_publicacion'],'fecha_fin_campo':p['fecha_fin_campo'],'decision':'cuarentena' if reasons else 'incorporar','razones':reasons,'evidencia':proof,'fichas':p.get('auditoria_fichas',[])})
 if not reasons:accepted.append(p)
result={**st,'encuestas':accepted,'quarantine':[a for a in audit if a['decision']=='cuarentena'],'audit':audit}
(root/'expanded-staging.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
review={'version':1,'reviewed_at':'2026-11-01','attribution':st['attribution'],'approved':accepted,'audit':audit,'coverage_complete':False}
(root.parents[1]/'historico-revisado.json').write_text(json.dumps(review,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Aceptadas',len(accepted),collections.Counter(p['instituto'] for p in accepted))
print('EM',collections.Counter(a['decision'] for a in audit if a['instituto']=='EM-Analytics'))
print('EM pendientes',[(a['fecha_publicacion'],a['razones']) for a in audit if a['instituto']=='EM-Analytics' and a['decision']=='cuarentena'])
