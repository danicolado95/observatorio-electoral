import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';
const core=createRequire(import.meta.url)('../js/radar-core.js');
test('original recuperado aporta una casa, no dos escenarios ni un modelo CIS',async()=>{
 const read=async p=>JSON.parse(await readFile(new URL(p,import.meta.url),'utf8'));
 const data=await read('./fixtures/before-originales.json'),before=await read('./fixtures/antes-originales.json');
 const id='wiki-d87e7607a2f453a3485c',added=data.encuestas.filter(p=>p.estudio_id===id);assert.equal(added.length,1);assert.equal(data.encuestas.length,before.encuestas.length+1);
 for(const old of before.encuestas)assert.deepEqual(data.encuestas.find(p=>p.estudio_id===old.estudio_id),old);
 assert(!('ALIANCA_CAT' in added[0].resultados));assert.equal(added[0].resultados.SUMAR,7.5);
 const series=core.medianTrend(core.select(data.encuestas,false),'PP','2026-11-01');
 for(const date of ['2025-12-26','2025-12-27']){const p=series.find(p=>p.date===date);assert.equal(p.n,3);assert(p.selected_ids.includes(id));assert.notEqual(p.value,null);}
 assert(!series.find(p=>p.date==='2025-12-07').selected_ids.includes(id),'No anticipar publicación');
 assert(!series.find(p=>p.date==='2025-12-28').selected_ids.includes(id),'No ampliar ventana');
});
