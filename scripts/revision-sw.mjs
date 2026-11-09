import {readFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';

const decision=JSON.parse(readFileSync(new URL('../docs/evidencia-reconciliacion/sw-20261107.json',import.meta.url),'utf8'));
const {historico,electografica,wikipedia,motivo}=decision;
const semantic=p=>Object.fromEntries(['estudio_id','instituto','tipo','ambito','fecha_publicacion','trabajo_campo_inicio','trabajo_campo_fin','tamano_muestra','resultados','fuente'].map(key=>[key,p?.[key]]));

export function esVarianteSW(p,previous,source){
 const old=previous?.encuestas?.find(row=>row.estudio_id===historico.estudio_id);
 if(!old || !isDeepStrictEqual(semantic(old),semantic(historico)) ||
    old.ingestion?.content_sha256!==historico.ingestion.content_sha256)return false;
 const observed=source==='wikipedia'?wikipedia:electografica;
 return isDeepStrictEqual(semantic(p),semantic(observed)) &&
   (source==='wikipedia'||p.ingestion?.content_sha256===electografica.ingestion.content_sha256);
}

export const motivoSW=motivo;
