import {readFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';

const {anterior,original}=JSON.parse(readFileSync(new URL('../docs/evidencia-reconciliacion/40db-20261109.json',import.meta.url),'utf8'));

export function corregir40dB(radar){
 return {...radar,encuestas:radar.encuestas.map(p=>isDeepStrictEqual(p,anterior)?structuredClone(original):p)};
}

export const original40dB=original;

export function esVarianteWikipedia40dB(p) {
 const identity=['instituto','tipo','ambito','fecha_publicacion','trabajo_campo_inicio','trabajo_campo_fin','tamano_muestra','fuente'];
 return p?.estudio_id==='wiki-9886f867b337e74f269e' &&
  p.ingestion?.source==='wikipedia' &&
  identity.every(key=>p[key]===original[key]) &&
  p.referencias?.some(ref=>ref.url===original.evidencia_publica[1].url) &&
  isDeepStrictEqual(p.resultados,{PP:31.9,PSOE:29.9,VOX:18,FA:3.9,FV:1.1,PODEMOS:1.2,SALF:2});
}
