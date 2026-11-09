import {readFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';

const {anterior,original}=JSON.parse(readFileSync(new URL('../docs/evidencia-reconciliacion/40db-20261109.json',import.meta.url),'utf8'));

export function corregir40dB(radar){
 return {...radar,encuestas:radar.encuestas.map(p=>isDeepStrictEqual(p,anterior)?structuredClone(original):p)};
}

export const original40dB=original;
