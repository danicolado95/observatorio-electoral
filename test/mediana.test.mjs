import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {medianTrend,select}=createRequire(import.meta.url)('../js/radar-core.js');
const p=(house,v,end='2024-01-21',pub=end,id=house)=>({instituto:house,estudio_id:id,trabajo_campo_fin:end,fecha_publicacion:pub,resultados:v===null?{}:{PP:v}});
const last=(rows,until='2024-01-21')=>medianTrend(rows,'PP',until).at(-1);
test('mediana impar/par y mínimo tres institutos',()=>{
 assert.equal(last([p('A',10),p('B',20)]).value,null);
 assert.equal(last([p('A',10),p('B',20),p('C',90)]).value,20);
 assert.equal(last([p('A',10),p('B',20),p('C',30),p('D',90)]).value,25);
});
test('una última por casa, selección antes del partido, sin rescatar dato viejo',()=>{
 const rows=[p('A',90,'2024-01-20','2024-01-20','old'),p('A',null),p('B',20),p('C',30)];
 assert.equal(last(rows).n,2); assert.equal(last(rows).value,null);
 assert(!last(rows).selected_ids.includes('old'));
});
test('21 días inclusivos y publicación tardía no anticipada',()=>{
 assert.equal(last([p('A',10,'2024-01-01'),p('B',20),p('C',30)]).n,3);
 assert.equal(last([p('A',10,'2023-12-31'),p('B',20),p('C',30)]).n,2);
 const rows=[p('A',10,'2024-01-20','2024-01-22'),p('B',20),p('C',30)];
 assert.equal(last(rows).n,2);
 assert.equal(last(rows,'2024-01-22').value,20);
});
test('CIS OFF/ON recalcula la misma mediana y reconoce alias',()=>{
 const rows=[p('A',10),p('B',20),p('Centro de Investigaciones Sociológicas',90)];
 assert.equal(last(select(rows,false)).value,null);
 assert.equal(last(select(rows,true)).value,20);
});
test('empates ambiguos excluyen casa; sin extrapolar y conserva huecos',()=>{
 const rows=[p('A',10),p('A',90,'2024-01-21','2024-01-21','other'),p('B',20),p('C',30)];
 assert.equal(last(rows).value,null);assert.deepEqual(last(rows).conflicts,['A']);
 assert.equal(last(rows,'2024-02-21').date,'2024-01-21');
 const gap=medianTrend([p('A',10),p('B',20),p('C',30),p('D',40,'2024-03-01')],'PP','2024-03-01');
 assert.equal(gap.find(x=>x.date==='2024-02-21').value,null);
});
