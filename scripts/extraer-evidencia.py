import importlib.util,json,re,hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('wiki',Path(__file__).with_name('importar-wikipedia.py'));w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
root=Path(__file__).resolve().parents[1]/'data/pipeline-test/wikipedia'
for path in (root/'primary').glob('*.json'):
 e=json.loads(path.read_text(encoding='utf8'))
 html=path.with_suffix('.html')
 if e.get('status')!=200 or not html.exists():continue
 tree=w.Parser(html.read_text(encoding='utf8',errors='replace')).root
 bodies=[n for n in tree.all('div') if 'content-inner' in n.a.get('class','').split()]
 body=bodies[0] if bodies else tree
 for n in tree.all():
  n.a={k:(v or '') for k,v in n.a.items()}
 e['body_text']=w.text(body)
 e['title']=' '.join(w.text(n) for n in tree.all('h1'))
 e['body_images']=list(dict.fromkeys(u for n in body.all() for k,v in n.a.items() if k in ['src','href','data-lazy-src'] for u in re.findall(r'https://[^\s"<>]+\.(?:png|jpg|jpeg|webp)',v or '')))
 featured=[n.a.get('content','') for n in tree.all('meta') if n.a.get('property')=='og:image']
 e['technical_images']=[u for u in e['body_images']+featured if re.search(r'ficha|tecnica|técnica',u,re.I)]
 path.write_text(json.dumps(e,ensure_ascii=False,indent=2),encoding='utf8')
manifest=[]
st=json.loads((root/'staging.json').read_text(encoding='utf8'))
for p in st['encuestas']+st['quarantine']:
 if p['instituto']!='EM-Analytics':continue
 key=hashlib.sha256(p['fuente'].encode()).hexdigest();e=json.loads((root/'primary'/f'{key}.json').read_text(encoding='utf8'))
 manifest.append({'id':p['estudio_id'],'date':p['fecha_publicacion'],'url':p['fuente'],'title':e.get('title'),'status':e.get('status'),'text':e.get('body_text',''),'images':e.get('technical_images',[]),'all_images':e.get('body_images',[])})
(root/'em-evidence.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('EM',len(manifest),'con ficha imagen',sum(bool(e['images']) for e in manifest),'con texto de método',sum(bool(re.search('cuestionario|formulario|CAWI|recogida',e['text'],re.I)) for e in manifest))
for e in manifest[:3]+manifest[-5:]:print(e['date'],e['title'],e['images'],e['text'][-1500:])
