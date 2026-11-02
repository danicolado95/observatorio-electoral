import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const RadarCore=createRequire(import.meta.url)('../js/radar-core.js');
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.events={};this.style={};this.textContent='';this.value='';this.checked=false;this.hidden=false;this.offsetWidth=250;this.offsetHeight=120;}
 setAttribute(k,v){this.attrs[k]=String(v);}
 append(...nodes){this.children.push(...nodes);if(this.tag==='select'&&!this.value)this.value=nodes[0].value;}
 prepend(...nodes){this.children.unshift(...nodes);}
 before(){}
 replaceChildren(...nodes){this.children=nodes;}
 addEventListener(type,fn){this.events[type]=fn;}
 getBoundingClientRect(){return {left:0,top:0,width:860,height:370,x:100,y:100};}
}
const flatten=n=>[n,...n.children.filter(c=>c instanceof Element).flatMap(flatten)];
test('DOM: continuidad entre medianas válidas sin imputar datos ni hover, en ambos rangos y CIS',async()=>{
 const ids=Object.fromEntries(['radar-grafico','radar-status','radar-sources','radar-cis'].map(id=>[id,new Element('div')]));
 const all=[];const make=tag=>{const n=new Element(tag);all.push(n);return n;};
 const document={createElement:make,createElementNS:(_,tag)=>make(tag),createTextNode:text=>text,getElementById:id=>ids[id],querySelector:()=>new Element('div'),head:new Element('head'),body:new Element('body')};
 const data=JSON.parse(await readFile(new URL('../data/radar-desarrollo.json',import.meta.url),'utf8'));
 const originalData=JSON.stringify(data),snapshots=[];
 const core={...RadarCore,medianTrend(...args){const rows=RadarCore.medianTrend(...args);snapshots.push({rows,before:JSON.stringify(rows)});return rows;}};
 class Clock extends Date{constructor(...args){super(...(args.length?args:['2026-11-01T12:00:00Z']));}}
 await vm.runInNewContext(await readFile(new URL('../js/radar.js',import.meta.url),'utf8'),{document,RadarCore:core,URLSearchParams,location:{search:'?radar=staging',hostname:'localhost'},fetch:async()=>({ok:true,json:async()=>data}),Date:Clock,Intl,innerWidth:1000,innerHeight:800});
 const range=all.find(n=>n.id==='radar-range'),tip=all.find(n=>n.id==='radar-tooltip');
 assert.equal(RadarCore.select(data.encuestas,false).length,480);
 assert.equal(data.encuestas.length,515);
 for(const cis of [false,true])for(const period of ['year','all']){
  ids['radar-cis'].checked=cis;range.value=period;range.events.change();
  const nodes=flatten(ids['radar-grafico']),start=RadarCore.chartStart('2026-11-01',period),end=Date.parse('2026-11-01');
  const polls=RadarCore.select(data.encuestas,cis);
  for(const party of ['PP','PSOE','VOX','SUMAR','PODEMOS','FA','SALF']){
   const series=RadarCore.medianTrend(polls,party,'2026-11-01');
   const valid=series.filter(p=>Date.parse(p.date)>=start&&p.value!==null);
   const lines=nodes.filter(n=>n.tag==='polyline'&&n.attrs['data-party']===party);
   assert.equal(lines.length,valid.length>1?1:0,`${party}/${period}/${cis}: una sola línea`);
   if(lines.length)assert.equal(lines[0].attrs.points,valid.map(p=>`${55+(Date.parse(p.date)-start)/(end-start)*690},${300-p.value/Number(nodes.find(n=>n.tag==='svg').attrs['data-ceiling'])*270}`).join(' '),'solo vértices con mediana real, en orden');
   if(!cis&&['PP','PSOE','VOX'].includes(party)){
    assert(series.filter(p=>p.value!==null).length>=1041);
    assert(series.some(p=>p.value===null));
   }
  }
  // A real interior gap crossed by the polyline; the date hover must still use null.
  if(!cis){
   const series=RadarCore.medianTrend(polls,'PP','2026-11-01'); const gap=series.find((p,i)=>p.value===null&&Date.parse(p.date)>=start&&series.slice(0,i).some(q=>q.value!==null)&&series.slice(i+1).some(q=>q.value!==null)).date;
   assert.equal(series.find(p=>p.date===gap).value,null);
   assert(series.some(p=>p.date<gap&&p.value!==null)&&series.some(p=>p.date>gap&&p.value!==null));
   nodes.find(n=>n.attrs['data-hover']==='median').events.pointermove({clientX:55+(Date.parse(gap)-start)/(end-start)*690,clientY:100});
   assert(tip.textContent.startsWith(gap+' · mediana de 21 días'));
   assert(tip.textContent.includes('PP: sin base suficiente'));
  }
  const expectedDots=polls.filter(p=>Date.parse(RadarCore.fieldDate(p))>=start&&RadarCore.fieldDate(p)<='2026-11-01'&&RadarCore.availableDate(p)<='2026-11-01').reduce((n,p)=>n+['PP','PSOE','VOX','SUMAR','PODEMOS','FA','SALF'].filter(party=>Number.isFinite(p.resultados[party])).length,0);
  assert.equal(nodes.filter(n=>n.tag==='circle').length,expectedDots);
  const labels=nodes.filter(n=>n.attrs['data-end-label']).map(n=>Number(n.attrs.y)).sort((a,b)=>a-b);for(let i=1;i<labels.length;i++)assert(labels[i]-labels[i-1]>=16);
  const ceiling=Number(nodes.find(n=>n.tag==='svg').attrs['data-ceiling']);assert(ceiling>=40&&ceiling<=45); if(!cis&&period==="year")assert.equal(ceiling,40); assert(nodes.filter(n=>n.attrs['data-end-label']).every(n=>n.textContent.endsWith('%')));
  assert(nodes.filter(n=>n.tag==='text').some(n=>/ene|abr|jul|oct/.test(n.textContent)));
  const surface=nodes.find(n=>n.attrs['data-hover']==='median');surface.events.keydown({key:'Home',preventDefault(){}});assert.equal(tip.hidden,false);surface.events.keydown({key:'Escape'});assert.equal(tip.hidden,true);
 }
 for(const {rows,before} of snapshots)assert.equal(JSON.stringify(rows),before,'renderizado no muta la serie diaria');
 assert.equal(JSON.stringify(data),originalData,'datos originales intactos');
});
test('DOM: hover inmediato, mediana, selector y CIS recalculan puntos y serie',async()=>{
 const ids=Object.fromEntries(['radar-grafico','radar-status','radar-sources','radar-cis'].map(id=>[id,new Element('div')]));
 const all=[];const make=tag=>{const n=new Element(tag);all.push(n);return n;};
 const document={createElement:make,createElementNS:(_,tag)=>make(tag),createTextNode:text=>text,getElementById:id=>ids[id],querySelector:()=>new Element('div'),head:new Element('head'),body:new Element('body')};
 const poll=(instituto,v,fecha,id=instituto)=>({instituto,fecha_publicacion:fecha,trabajo_campo_inicio:fecha,trabajo_campo_fin:fecha,tamano_muestra:1200,estudio_id:id,fuente:'https://example.org/'+id,resultados:{PP:v}});
 const encuestas=[poll('A',20,'2026-10-30'),poll('B',30,'2026-10-30'),poll('C',40,'2026-10-30'),poll('CIS',90,'2026-11-01'),poll('Histórica',12,'2023-08-13'),poll('SinDato',null,'2026-11-01')];
 class Clock extends Date{constructor(...args){super(...(args.length?args:['2026-11-01T12:00:00Z']));}}
 await vm.runInNewContext(await readFile(new URL('../js/radar.js',import.meta.url),'utf8'),{document,RadarCore,URLSearchParams,location:{search:'?radar=staging',hostname:'localhost'},fetch:async()=>({ok:true,json:async()=>({encuestas,status:{message:'prueba'}})}),Date:Clock,Intl,innerWidth:1000,innerHeight:800});
 const nodes=()=>flatten(ids['radar-grafico']);const circles=()=>nodes().filter(n=>n.tag==='circle');
 assert.equal(circles().length,3);assert.equal(ids['radar-cis'].checked,false);
 const event={clientX:745,clientY:100,stopPropagation(){}};
 circles()[0].events.pointerenter(event);
 const tip=all.find(n=>n.id==='radar-tooltip');assert.equal(tip.hidden,false);assert.match(tip.textContent,/A · 2026-10-30/);assert.match(tip.textContent,/Muestra: 1200/);assert.match(tip.textContent,/Referencia: https/);
 nodes().find(n=>n.attrs['data-hover']==='median').events.pointermove(event);assert.match(tip.textContent,/mediana de 21 días/);assert.match(tip.textContent,/n=3 institutos/);
 const lineBefore=nodes().find(n=>n.tag==='polyline').attrs.points;
 ids['radar-cis'].checked=true;ids['radar-cis'].events.change();assert.equal(circles().length,4);assert.notEqual(nodes().find(n=>n.tag==='polyline').attrs.points,lineBefore);
 const range=all.find(n=>n.id==='radar-range');range.value='all';range.events.change();assert.equal(circles().length,5);
 nodes().find(n=>n.tag==='svg').events.pointerleave();assert.equal(tip.hidden,true);
});
