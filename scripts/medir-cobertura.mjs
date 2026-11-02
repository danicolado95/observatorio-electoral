import {readFile,writeFile,mkdir} from 'node:fs/promises';import {createRequire} from 'node:module';import {resolve,sep} from 'node:path';import {pathToFileURL} from 'node:url';
const core=createRequire(import.meta.url)('../js/radar-core.js');
const out=process.argv[2]?pathToFileURL(resolve(process.argv[2])+sep):new URL('../data/pipeline-test/wikipedia/coverage/',import.meta.url);await mkdir(out,{recursive:true});
const before=JSON.parse(await readFile(new URL('../data/pipeline-test/wikipedia/before-expansion.json',import.meta.url)));
const after=JSON.parse(await readFile(new URL('../data/pipeline-test/wikipedia/radar.json',import.meta.url)));
const parties=['PP','PSOE','VOX','SUMAR'],today='2026-11-01',days=[];
for(let t=Date.parse('2023-07-23');t<=Date.parse(today);t+=86400000)days.push(new Date(t).toISOString().slice(0,10));
const result={period:['2023-07-23',today],calendar_days:days.length,method:'Ventana [t-20,t], fin de campo, disponibilidad por publicación si consta; última por casa antes del filtro de partido; mínimo tres; mediana no ponderada; empate conflictivo excluye casa.',before:{},after:{}};
const csv=['escenario,cis,fecha,partido,mediana,n_institutos'];
for(const [label,data]of [['before',before],['after',after]]){
 const priv=core.select(data.encuestas,false);result[label]={private_polls:priv.length,cis_polls:data.encuestas.length-priv.length,private_institutes:new Set(priv.map(p=>p.instituto)).size,institutes:new Set(data.encuestas.map(p=>p.instituto)).size,missing_sample:priv.filter(p=>p.tamano_muestra==null).length,unknown_publication:priv.filter(p=>!p.fecha_publicacion).length,by_institute:Object.fromEntries([...new Set(priv.map(p=>p.instituto))].sort().map(n=>[n,priv.filter(p=>p.instituto===n).length])),series:{}};
 for(const cis of [false,true])for(const party of parties){
  const series=new Map(core.medianTrend(core.select(data.encuestas,cis),party,today).map(p=>[p.date,p]));let gaps=[],run=null,valid=0;
  for(const day of days){const p=series.get(day),value=p?.value??null;if(value!==null){valid++;if(run){gaps.push(run);run=null;}}else{if(!run)run={start:day,end:day,days:0};run.end=day;run.days++;}csv.push([label,cis?'ON':'OFF',day,party,value??'',p?.n??0].join(','));}
  if(run)gaps.push(run);
  result[label].series[(cis?'ON':'OFF')+'_'+party]={valid_days:valid,gap_days:days.length-valid,gap_runs:gaps.length,longest_gap:gaps.toSorted((a,b)=>b.days-a.days)[0]??null,gaps};
 }
}
await writeFile(new URL('cobertura-antes-despues.json',out),JSON.stringify(result,null,2)+'\n');await writeFile(new URL('medianas-diarias.csv',out),csv.join('\n')+'\n');
console.log(JSON.stringify({days:days.length,before:result.before.private_polls,after:result.after.private_polls,houses:[result.before.private_institutes,result.after.private_institutes],series:Object.fromEntries(parties.map(p=>[p,[result.before.series['OFF_'+p],result.after.series['OFF_'+p]].map(s=>({valid:s.valid_days,gap:s.gap_days,runs:s.gap_runs,longest:s.longest_gap}))]))},null,2));
