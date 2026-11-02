"""Actualización diaria SOLO de staging. No publica ni modifica data/radar.json."""
import argparse, datetime, hashlib, json, os, subprocess, sys, tempfile
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from zoneinfo import ZoneInfo

ROOT=Path(__file__).resolve().parents[1]
TARGET=ROOT/'data/pipeline-test/wikipedia'
URL='https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Spanish_general_election'

def update(html=None, user_agent=None):
    TARGET.mkdir(parents=True,exist_ok=True)
    lock=TARGET/'daily.lock'
    fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY)
    os.close(fd)
    saved={name:(TARGET/name).read_bytes() if (TARGET/name).exists() else None for name in ['staging.json','report.json','radar.json']}
    try:
        if html:
            raw=Path(html).read_bytes()
        else:
            if not user_agent: raise ValueError('Configure WIKIPEDIA_USER_AGENT con contacto real')
            cache=TARGET/'http-cache.json'
            headers={'User-Agent':user_agent}
            if cache.exists(): headers.update(json.loads(cache.read_text()))
            try:
                with urlopen(Request(URL,headers=headers),timeout=60) as response:
                    raw=response.read(12000001)
                    cache_headers={k:v for k,v in [('If-None-Match',response.headers.get('ETag')),('If-Modified-Since',response.headers.get('Last-Modified'))] if v}
            except HTTPError as e:
                if e.code==304:
                    print('Sin cambios HTTP; histórico conservado');return
                raise
            if len(raw)>12000000: raise ValueError('Respuesta demasiado grande')
        today=datetime.datetime.now(ZoneInfo('Europe/Madrid')).date().isoformat()
        with tempfile.TemporaryDirectory() as temp:
            source=Path(temp)/'original.html';source.write_bytes(raw)
            subprocess.run([sys.executable,str(ROOT/'scripts/importar-wikipedia.py'),'--html',str(source),'--today',today],check=True,stdout=subprocess.DEVNULL)
        staging=json.loads((TARGET/'staging.json').read_text(encoding='utf8'))
        if saved['staging.json']:
            previous=json.loads(saved['staging.json'])
            rows={p['estudio_id']:p for p in previous['encuestas']}
            for poll in staging['encuestas']:
                prior=rows.get(poll['estudio_id'])
                keys=['instituto','fecha_publicacion','trabajo_campo_inicio','trabajo_campo_fin','tamano_muestra','resultados']
                if prior and any(prior.get(k)!=poll.get(k) for k in keys): raise ValueError('Conflicto histórico: '+poll['estudio_id'])
                rows[poll['estudio_id']]=poll
            staging['encuestas']=sorted(rows.values(),key=lambda p:(p['fecha_publicacion'],p['estudio_id']))
            staging['report']['historical_usable']=len(rows)
            (TARGET/'staging.json').write_text(json.dumps(staging,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        subprocess.run(['node',str(ROOT/'scripts/preparar-radar-wikipedia.mjs')],check=True,cwd=ROOT)
        run={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sha256':hashlib.sha256(raw).hexdigest(),'historical_usable':len(staging['encuestas']),'mode':'local-fixture' if html else 'network'}
        runs=TARGET/'runs';runs.mkdir(exist_ok=True)
        (runs/(datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%f')+'.json')).write_text(json.dumps(run,indent=2),encoding='utf8')
        if not html: cache.write_text(json.dumps(cache_headers),encoding='utf8')
    except BaseException:
        for name,raw in saved.items():
            dest=TARGET/name
            if raw is None: dest.unlink(missing_ok=True)
            else:
                temporary=dest.with_suffix('.restore');temporary.write_bytes(raw);os.replace(temporary,dest)
        raise
    finally:
        lock.unlink(missing_ok=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--html');args=parser.parse_args()
    update(args.html,os.environ.get('WIKIPEDIA_USER_AGENT'))
