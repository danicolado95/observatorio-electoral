import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chartStart,pollTooltip}=createRequire(import.meta.url)('../js/radar-core.js');
test('selector limita último año y conserva 23J completo',()=>{
 assert.equal(new Date(chartStart('2026-11-01','year')).toISOString().slice(0,10),'2025-11-01');
 assert.equal(new Date(chartStart('2026-11-01','all')).toISOString().slice(0,10),'2023-07-23');
});
test('hover conserva instituto, fecha, valor, referencia y ausencia de muestra',()=>{
 const p={instituto:'Casa',fecha_publicacion:'2026-10-30',resultados:{PP:31.2},fuente:'https://example.org/original'};
 const text=pollTooltip(p,'PP');for(const value of ['Casa','2026-10-30','31.2%','https://example.org/original','Muestra: no disponible'])assert(text.includes(value));
 assert(pollTooltip({...p,tamano_muestra:1200},'PP').includes('Muestra: 1200'));
});
