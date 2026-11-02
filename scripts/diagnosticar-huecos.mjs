import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
const root=new URL('../',import.meta.url),read=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const out=resolve(process.argv[2]||'data/pipeline-test/wikipedia/huecos');await mkdir(out,{recursive:true});
const before=await read('data/pipeline-test/wikipedia/antes-huecos.json'),after=await read('data/pipeline-test/wikipedia/radar.json');
const source=await readFile(new URL('js/radar-core.js',root),'utf8');
const core=createRequire(import.meta.url)('../js/radar-core.js');
const days=[];for(let t=Date.parse('2023-07-23');t<=Date.parse('2026-11-01');t+=86400000)days.push(new Date(t).toISOString().slice(0,10));
// Sensibilidad aislada en memoria: no modifica el cálculo ni la regla de la web.
function calculator(window){
 assert.equal((source.match(/age>20/g)||[]).length,1);
 const ctx={module:{exports:{}}};vm.runInNewContext(source.replace('age>20',`age>${window-1}`),ctx);
 return ctx.module.exports;
}
function runs(rows){const result=[];let run=null;for(const r of rows){if(r.value==null){if(!run)run={start:r.date,end:r.date,days:0,n_histogram:{},causes:{}};run.end=r.date;run.days++;run.n_histogram[r.n]=(run.n_histogram[r.n]||0)+1;for(const cause of r.causes||[])run.causes[cause]=(run.causes[cause]||0)+1;}else if(run){result.push(run);run=null;}}if(run)result.push(run);return result.sort((a,b)=>b.days-a.days||a.start.localeCompare(b.start));}
const result={period:[days[0],days.at(-1)],calendar_days:days.length,production_window:21,minimum_institutes:3,cis:false,before:{},after:{},gained_days:{}};
const csv=['escenario,ventana,fecha,partido,mediana,n_institutos,causas,ids'];
for(const [label,data] of [['before',before],['after',after]]){
 const polls=core.select(data.encuestas,false);result[label].private_polls=polls.length;
 for(const window of [21,28,35]){
  result[label][window]={};
  for(const party of ['PP','PSOE','VOX','SUMAR']){
   const calc=calculator(window),points=calc.medianTrend(polls,party,days.at(-1));
   if(window===21)assert.equal(JSON.stringify(points),JSON.stringify(core.medianTrend(polls,party,days.at(-1))));
   const map=new Map(points.map(p=>[p.date,p]));
   const daily=days.map(date=>{
    const p=map.get(date)||{date,value:null,n:0,selected_ids:[],conflicts:[]};
    const causes=[];
    if(p.value==null){
     causes.push('menos_de_3_institutos_con_porcentaje');
     if(p.conflicts.length)causes.push('empate_ambiguo');
     if(p.selected_ids.length>p.n)causes.push('partido_ausente_en_ultima_oleada');
     const fieldRows=polls.filter(q=>{const age=(Date.parse(date)-Date.parse(core.fieldDate(q)))/86400000;return age>=0&&age<window;});
     if(fieldRows.some(q=>core.availableDate(q)>date))causes.push('estudio_en_campo_pero_aun_no_publicado');
     if(!fieldRows.length)causes.push('sin_estudios_en_ventana');
    }
    csv.push([label,window,date,party,p.value??'',p.n,causes.join('|'),p.selected_ids.join('|')].join(','));
    return {...p,causes};
   });
   const valid=daily.filter(p=>p.value!=null).length;
   result[label][window][party]={valid_days:valid,gap_days:days.length-valid,gaps:runs(daily)};
   if(window===21)result[label][window][party].daily=daily;
  }
 }
}
for(const party of ['PP','PSOE','VOX','SUMAR']){
 const b=result.before[21][party].daily,a=result.after[21][party].daily;
 result.gained_days[party]=a.filter((p,i)=>p.value!=null&&b[i].value==null).map(p=>p.date);
 assert(!a.some((p,i)=>p.value==null&&b[i].value!=null),'No perder días válidos');
 delete result.before[21][party].daily;delete result.after[21][party].daily;
}
await writeFile(resolve(out,'cobertura.json'),JSON.stringify(result,null,2)+'\n');
await writeFile(resolve(out,'dias.csv'),csv.join('\n')+'\n');
const gaps=['escenario,partido,inicio,fin,dias,institutos_por_dia,causas_por_dia'];
for(const label of ['before','after'])for(const party of ['PP','PSOE','VOX','SUMAR'])for(const g of result[label][21][party].gaps)gaps.push([label,party,g.start,g.end,g.days,JSON.stringify(g.n_histogram),JSON.stringify(g.causes)].map(x=>'"'+String(x).replaceAll('"','""')+'"').join(','));
await writeFile(resolve(out,'intervalos.csv'),gaps.join('\n')+'\n');
console.log(JSON.stringify({counts:[result.before.private_polls,result.after.private_polls],windows:Object.fromEntries([21,28,35].map(w=>[w,Object.fromEntries(['PP','PSOE','VOX','SUMAR'].map(p=>[p,[result.before[w][p].valid_days,result.after[w][p].valid_days]]))])),gained:result.gained_days},null,2));
