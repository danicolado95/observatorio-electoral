import {existsSync} from 'node:fs';
import {verificar} from '../scripts/validar-integracion-manual.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';
const read=async p=>JSON.parse(await readFile(new URL('../data/pipeline-test/electografica/'+p,import.meta.url)));
test('Electográfica conserva valores previos, no duplica oleadas y es idempotente',{skip:!existsSync(new URL('../data/pipeline-test/electografica/snapshot.json',import.meta.url))},async()=>{
 const before=await read('before.json'),after=await read('radar.json');
 verificar({original:{encuestas:[]},desarrollo:{encuestas:[]},cis:{encuestas:[]},wikipedia:before,combinado:after,
   reporte:await read('report.json'),auditoria:await read('audit.json'),cuarentena:await read('quarantine.json')});
 const added=after.encuestas.filter(p=>!before.encuestas.some(q=>q.estudio_id===p.estudio_id));assert(added.length>0);
 for(const p of added){assert.notEqual(p.instituto,'CIS');assert(p.url_electografica);assert(p.fuente.startsWith('https://'));assert(p.trabajo_campo_fin<=p.fecha_publicacion);assert.equal(after.encuestas.filter(q=>q.instituto===p.instituto&&q.trabajo_campo_fin===p.trabajo_campo_fin).length,1);}
 execFileSync(process.execPath,['scripts/importar-electografica.mjs'],{cwd:new URL('../',import.meta.url)});assert.deepEqual((await read('radar.json')).encuestas,after.encuestas);
});
