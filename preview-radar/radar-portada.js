(function (root) {
  'use strict';
  const DAY = 86400000;
  const date = s => Date.parse(s + 'T00:00:00Z');
  function normalizeInstitute(value) {
    if (typeof value !== 'string' || !value.trim()) throw Error('Instituto inválido');
    const name = value.trim().replace(/\s+/g, ' ');
    const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    return ['CIS', 'C.I.S.', 'CENTRO DE INVESTIGACIONES SOCIOLOGICAS'].includes(key) ? 'CIS' : name;
  }
  function select(polls, cis) { return polls.filter(p => cis || normalizeInstitute(p.instituto) !== 'CIS'); }
  const fieldDate = p => p.fecha_fin_campo || p.trabajo_campo_fin;
  const availableDate = p => p.fecha_publicacion || (p.publicacion_verificada ? fieldDate(p) : null);
  // Media gaussiana retrospectiva, 14 días de ancho, ventana de 42 días.
  // No extrapolar ni conectar periodos sin observaciones. El 23J no es un sondeo.
  function trend(polls, party, until) {
    const rows = polls.filter(p => Number.isFinite(p.resultados[party]));
    if (!rows.length) return [];
    const start = Math.min(...rows.map(p => date(p.trabajo_campo_fin)));
    const end = Math.min(date(until), Math.max(...rows.map(p => date(p.trabajo_campo_fin))));
    const points = [];
    for (let t = start; t <= end; t += DAY) {
      const window = rows.filter(p => { const age = (t-date(p.trabajo_campo_fin))/DAY; return age >= 0 && age <= 42; });
      let weight = 0, total = 0;
      for (const p of window) { const w = Math.exp(-0.5 * (((t-date(p.trabajo_campo_fin))/DAY)/14)**2); weight += w; total += w*p.resultados[party]; }
      points.push({date:new Date(t).toISOString().slice(0,10), value:weight ? total/weight : null, n:window.length});
    }
    return points;
  }
  // Conserva trend() para contrastes y regresiones del cálculo anterior.
  function medianTrend(polls, party, until) {
    const rows=polls.filter(p=>availableDate(p) && fieldDate(p));
    if(!rows.length) return [];
    const start=Math.max(date('2023-07-23'),Math.min(...rows.map(p=>date(availableDate(p)))));
    const end=Math.min(date(until),Math.max(...rows.map(p=>date(availableDate(p)))));
    const points=[];
    for(let t=start;t<=end;t+=DAY){
      const houses=new Map();
      for(const p of rows){
        const age=(t-date(fieldDate(p)))/DAY;
        if(age<0 || age>20 || date(availableDate(p))>t)continue;
        const key=normalizeInstitute(p.instituto).toLocaleUpperCase('es');
        const current=houses.get(key);
        const order=fieldDate(p)+'|'+availableDate(p);
        if(!current || order>current.order)houses.set(key,{order,rows:[p]});
        else if(order===current.order && !current.rows.some(q=>q.estudio_id===p.estudio_id))current.rows.push(p);
      }
      const conflicts=[...houses.entries()].filter(([,g])=>g.rows.length>1).map(([name])=>name);
      // Selección por instituto ANTES del filtro de partido. Un empate ambiguo
      // excluye la casa; nunca se decide por orden de entrada.
      const selected=[...houses.values()].filter(g=>g.rows.length===1).map(g=>g.rows[0]);
      const values=selected.filter(p=>Number.isFinite(p.resultados[party])).map(p=>p.resultados[party]).sort((a,b)=>a-b);
      const n=values.length,mid=Math.floor(n/2);
      points.push({date:new Date(t).toISOString().slice(0,10),value:n>=3?(n%2?values[mid]:(values[mid-1]+values[mid])/2):null,n,selected_ids:selected.map(p=>p.estudio_id).sort(),conflicts});
    }
    return points;
  }
  function chartStart(today,range){const end=new Date(today+'T00:00:00Z');end.setUTCFullYear(end.getUTCFullYear()-1);return range==='all'?date('2023-07-23'):Math.max(date('2023-07-23'),end.getTime());}
  function pollTooltip(p,party){return [p.instituto+' · '+fieldDate(p)+(p.fecha_publicacion?'':'*'),party+': '+p.resultados[party]+'%', 'Publicación: '+(p.fecha_publicacion??'no consta; * fecha de fin de campo'), 'Campo: '+(p.trabajo_campo_inicio??'no disponible')+' – '+(fieldDate(p)??'no disponible'), 'Muestra: '+(p.tamano_muestra??'no disponible'),p.metodologia?.tipo?'Método: '+p.metodologia.tipo:null,'Referencia: '+p.fuente].filter(Boolean).join('\n');}
  const api = {select, trend, medianTrend, normalizeInstitute,chartStart,pollTooltip,fieldDate,availableDate};
  if (typeof module !== 'undefined') module.exports = api;
  else root.RadarCore = api;
})(typeof globalThis === 'undefined' ? this : globalThis);

(()=>{
const box=document.getElementById('radar-grafico'),status=document.getElementById('radar-status');
const create=(tag,attrs={},text='')=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);n.textContent=text;return n;};
let data;
const colors={PP:'#347cbd',PSOE:'#e54440',VOX:'#69a554',SUMAR:'#d36a9d',PODEMOS:'#8541b5',ERC:'#cf9d14',JUNTS:'#00a992',EH_BILDU:'#438d74',PNV:'#65894a',BNG:'#7a9cc7',CC:'#b89d00',UPN:'#65738a',SALF:'#785a46',ALIANCA_CAT:'#164c81',ADELANTE_ANDALUCIA:'#24a77e',FA:'#f07901',FV:'#e84d00'};
const primaryParties=['PP','PSOE','VOX','SUMAR','PODEMOS','FA','SALF'];
const enabled=new Set(primaryParties);
let parties=primaryParties;
const partyLabels={EH_BILDU:'EH Bildu',ALIANCA_CAT:'Aliança Catalana',ADELANTE_ANDALUCIA:'Adelante Andalucía'};


const sheet=document.createElement('style');sheet.textContent=`
#radar-principal .radar-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:20px 0 12px}
#radar-principal .radar-controls label{display:inline-flex;align-items:center;gap:5px;min-height:36px;padding:2px 9px;border:1px solid #e0e6e1;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;background:#fff}
#radar-principal select{min-height:40px;border:1px solid #cad5cd;border-radius:6px;background:#fff;color:#24362d;padding:0 10px;font:inherit;font-size:13px}
#radar-principal input{accent-color:#3e6551}#radar-principal :focus-visible{outline:2px solid #315e48;outline-offset:3px}
#radar-grafico svg{display:block;width:100%;height:auto;font-family:inherit}#radar-grafico{min-width:0}
#radar-principal .radar-help{font-size:12px;color:#647469;margin:8px 0 14px;line-height:1.6}
#radar-principal details{margin-top:14px;font-size:12px;color:#647469}#radar-principal summary{cursor:pointer;padding:8px 0}
#radar-status{padding-top:12px;border-top:1px solid #e4e9e5;font-size:12px}
@media(max-width:640px){#radar-principal{padding:16px}#radar-principal .radar-controls{gap:6px}#radar-principal .radar-controls label{min-height:40px}}
`;document.head.append(sheet);
const controls=document.createElement('div');controls.className='radar-controls';controls.setAttribute('role','group');controls.setAttribute('aria-label','Periodo, CIS y partidos');
const extra=document.createElement('details'),extraTitle=document.createElement('summary'),extraControls=document.createElement('div');extraTitle.textContent='Más partidos';extraControls.className='radar-controls';extra.append(extraTitle,extraControls);
extraControls.setAttribute('role','group');
extraControls.setAttribute('aria-label','Más partidos');
extra.hidden=true;
function partyControl(party){
 const label=document.createElement('label'),input=document.createElement('input');
 input.type='checkbox';
 input.checked=enabled.has(party);
 input.addEventListener('change',()=>{
  if(input.checked)enabled.add(party);
  else enabled.delete(party);
  draw();
 });
 label.style.color=colors[party]||'#68786c';
 label.append(input,document.createTextNode(' '+(partyLabels[party]||party.replaceAll('_',' '))));
 return label;
}
controls.append(...primaryParties.map(partyControl));
function updateParties(polls){
 const available=new Set();
 for(const poll of polls){
  for(const [party,value] of Object.entries(poll.resultados)){
   if(Number.isFinite(value)&&!primaryParties.includes(party))available.add(party);
  }
 }
 const next=[...primaryParties,...[...available].sort((a,b)=>a.localeCompare(b,'es'))];
 if(next.length===parties.length&&next.every((party,index)=>party===parties[index]))return;
 parties=next;
 extraControls.replaceChildren(...parties.slice(primaryParties.length).map(partyControl));
 extra.hidden=!available.size;
}
box.before(controls,extra);
const range=document.createElement('select');range.id='radar-range';range.setAttribute('aria-label','Periodo del gráfico');
for(const [value,text] of [['year','Último año'],['all','Desde 23J']]){const option=document.createElement('option');option.value=value;option.textContent=text;range.append(option);}controls.prepend(range);range.addEventListener('change',draw);
const cis=document.getElementById('radar-cis');cis.checked=false;
const cisLabel=cis.closest?.('label');if(cisLabel){const old=cisLabel.parentElement;controls.append(cisLabel);if(old&&old!==controls)old.hidden=true;}
status.setAttribute('role','status');status.setAttribute('aria-live','polite');
const tip=document.createElement('div');tip.id='radar-tooltip';tip.setAttribute('role','tooltip');tip.hidden=true;
tip.style.cssText='position:fixed;z-index:1000;pointer-events:none;max-width:310px;padding:12px 15px;background:#fff;color:#24362d;border:1px solid #dce5df;border-radius:8px;box-shadow:0 5px 24px #18302720;font-size:13px;white-space:pre-line;line-height:1.55;overflow-wrap:anywhere';document.body.append(tip);
function showTip(event,text){tip.textContent=text;tip.hidden=false;tip.style.left=Math.max(8,Math.min(event.clientX+14,innerWidth-tip.offsetWidth-12))+'px';tip.style.top=Math.max(8,Math.min(event.clientY+14,innerHeight-tip.offsetHeight-12))+'px';}

const note=document.createElement('p');note.className='sub';note.textContent='Puntos por fin de trabajo de campo. * Publicación sin fecha conocida; se conserva el fin de campo verificado. Mediana no ponderada por muestra: 21 días naturales (día actual y 20 anteriores), última encuesta por instituto, mínimo 3 por partido. Con fecha de publicación conocida, el estudio entra en la mediana desde ese día. Las líneas unen medianas válidas, incluso entre fechas sin base suficiente; esos segmentos no añaden medianas diarias. CIS excluido por defecto.';const method=document.createElement('details'),methodTitle=document.createElement('summary');methodTitle.textContent='Cómo se calcula y qué significan los huecos';method.append(methodTitle,note);box.before(method);
const help=document.createElement('p');help.className='radar-help';help.textContent='Líneas: mediana de 21 días · Puntos: encuestas individuales. Explora con el cursor o el teclado. En móvil, desliza el gráfico horizontalmente.';box.before(help);
const sourceBox=document.getElementById('radar-sources'),details=document.createElement('details'),summary=document.createElement('summary'),sourceRows=document.createElement('div');details.append(summary,sourceRows);sourceBox.replaceChildren(details);

function draw(){
if(!data)return;
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'}).format(new Date());
const polls=RadarCore.select(data.encuestas,document.getElementById('radar-cis').checked);
const compact=box.clientWidth<600;
const [chartWidth,left,right]=compact?[350,34,250]:[860,55,745];
const plotWidth=right-left;
const svg=create('svg',{viewBox:`0 0 ${chartWidth} 370`,preserveAspectRatio:'xMidYMid meet',width:'100%',role:'group','aria-label':'Mediana móvil de 21 días · '+(range.value==='all'?'Desde 23J':'Último año')});
const end=Date.parse(today),start=RadarCore.chartStart(today,range.value);
const x=d=>left+(Date.parse(d)-start)/(end-start)*plotWidth;
const visibleParties=parties.filter(p=>enabled.has(p));
const trends=new Map(parties.map(p=>[p,RadarCore.medianTrend(polls,p,today)]));
const visiblePolls=polls.filter(p=>Date.parse(RadarCore.fieldDate(p))>=start&&RadarCore.fieldDate(p)<=today&&RadarCore.availableDate(p)<=today);
const cards=document.getElementById('poll-stats');
const cardParties=['PP','PSOE','VOX','FA','PODEMOS','SALF'];
cards.replaceChildren(...cardParties.map(party=>{
 const last=trends.get(party).findLast(point=>Number.isFinite(point.value));
 const card=document.createElement('div');card.className='panel';
 for(const [cls,value] of [['mini-label',party],['stat',last?last.value.toFixed(1).replace('.',',')+'%':'—'],['sub',last?'Mediana móvil · '+last.date:'Sin base suficiente']]){
  const el=document.createElement('div');el.className=cls;el.textContent=value;if(cls==='mini-label'){
   el.style.borderLeft='4px solid '+colors[party];
   el.style.paddingLeft='8px';
  }
  card.append(el);
 }
 return card;
}));
const maxima=[...visiblePolls.flatMap(p=>visibleParties.map(k=>p.resultados[k])),...visibleParties.flatMap(party=>trends.get(party).filter(p=>Date.parse(p.date)>=start).map(p=>p.value))].filter(Number.isFinite);
const ceiling=Math.max(10,Math.ceil(((maxima.length?Math.max(...maxima):0)+2)/5)*5),y=v=>300-v/ceiling*270;
svg.setAttribute('data-ceiling',ceiling);
for(let v=0;v<=ceiling;v+=ceiling>50?10:5)svg.append(create('line',{x1:left,x2:right,y1:y(v),y2:y(v),stroke:'#e8ede9','stroke-width':1}),create('text',{x:left-7,y:y(v)+4,'text-anchor':'end',fill:'#748078','font-size':11},v+'%'));
const firstMonth=new Date(start);firstMonth.setUTCDate(1);firstMonth.setUTCMonth(firstMonth.getUTCMonth()+1);
for(let d=firstMonth;d.getTime()<=end;d.setUTCMonth(d.getUTCMonth()+1)){
 const step=compact?(range.value==='all'?12:3):(range.value==='all'?3:1);
 if(d.getUTCMonth()%step!==0)continue;
 const date=d.toISOString().slice(0,10),label=new Intl.DateTimeFormat('es',{month:'short',timeZone:'UTC'}).format(d).replace('.','')+(d.getUTCMonth()===0||range.value==='all'?' '+d.getUTCFullYear():'');
 svg.append(create('text',{x:x(date),y:326,'text-anchor':'middle',fill:'#748078','font-size':11},label));
}
const seriesByParty=new Map();
const latest=document.createElement('p');latest.className='radar-help';let meaningful=0;const endLabels=[];
for(const party of parties.filter(p=>enabled.has(p))){
 const color=colors[party]||'#68786c';let segment=[];
 const flush=()=>{if(segment.length>1){const line=create('polyline',{points:segment.join(' '),fill:'none',stroke:color,'stroke-width':2.6,'stroke-linejoin':'round','stroke-linecap':'round','data-party':party});line.append(create('title',{},party+' · mediana móvil de 21 días'));svg.append(line);}segment=[];};
 const series=trends.get(party);seriesByParty.set(party,new Map(series.map(p=>[p.date,p])));
 // Join only observed valid medians; keep daily nulls in seriesByParty for hover.
 for(const point of series){if(Date.parse(point.date)<start)continue;if(point.value===null)continue;meaningful++;segment.push(`${x(point.date)},${y(point.value)}`);}flush();
 const last=series.findLast(p=>Number.isFinite(p.value));
 if(last && Date.parse(last.date)>=start)endLabels.push({party,color,last,target:y(last.value)});

}
endLabels.sort((a,b)=>a.target-b.target);
for(let i=0;i<endLabels.length;i++)endLabels[i].labelY=Math.max(endLabels[i].target,i?endLabels[i-1].labelY+16:36);
if(endLabels.length&&endLabels.at(-1).labelY>295){endLabels.at(-1).labelY=295;for(let i=endLabels.length-2;i>=0;i--)endLabels[i].labelY=Math.min(endLabels[i].labelY,endLabels[i+1].labelY-16);}
for(const item of endLabels){const {party,color,last,labelY}=item;svg.append(create('line',{x1:x(last.date),y1:y(last.value),x2:right+5,y2:labelY,stroke:color,'stroke-opacity':.45}),create('text',{x:right+9,y:labelY+4,fill:color,'font-size':10,'font-weight':600,'data-end-label':party},party+' '+last.value.toFixed(1).replace('.',',')+'%'));}
latest.textContent='Última mediana válida al extremo derecho (porcentaje de voto). Puede corresponder a una fecha anterior a hoy; consulta la fecha al explorar.';
if(!meaningful)svg.append(create('text',{x:left,y:160,'font-size':compact?10:16},'Sin base suficiente: se necesitan al menos 3 institutos.'));
// Transparent date surface sits below individual point targets.
const surface=create('rect',{x:left,y:30,width:plotWidth,height:270,fill:'transparent','data-hover':'median',tabindex:0,role:'slider','aria-label':'Explorar medianas por fecha','aria-valuemin':0,'aria-valuemax':Math.round((end-start)/86400000),'aria-valuenow':Math.round((end-start)/86400000)});let keyboardDate=end;
function exploreDate(event){
 const sx=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse()).x;
 const stamp=Math.max(start,Math.min(end,start+Math.round((sx-left)/plotWidth*(end-start)/86400000)*86400000));
 const date=new Date(stamp).toISOString().slice(0,10);
 const values=[...seriesByParty].map(([party,series])=>{const p=series.get(date);return party+': '+(p?.value==null?'sin base suficiente':p.value.toFixed(1)+'%')+(p?' · n='+p.n+' institutos':' · sin serie en esta fecha');});
 showTip(event,date+' · mediana de 21 días\n'+values.join('\n'));
}
surface.addEventListener('pointermove',exploreDate);
surface.addEventListener('click',exploreDate);
surface.addEventListener('keydown',event=>{if(event.key==='Escape'){tip.hidden=true;return;}if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();keyboardDate=event.key==='Home'?start:event.key==='End'?end:Math.max(start,Math.min(end,keyboardDate+(event.key==='ArrowLeft'?-86400000:86400000)));surface.setAttribute('aria-valuenow',Math.round((keyboardDate-start)/86400000));const date=new Date(keyboardDate).toISOString().slice(0,10);surface.setAttribute('aria-valuetext',date);const r=svg.getBoundingClientRect();showTip({clientX:r.left+55,clientY:r.top+40},date+' · mediana de 21 días\n'+[...seriesByParty].map(([party,rows])=>party+': '+(rows.get(date)?.value==null?'sin base suficiente':rows.get(date).value.toFixed(1)+'%')).join('\n'));});
surface.addEventListener('blur',()=>tip.hidden=true);svg.append(surface);
for(const p of polls.filter(p=>Date.parse(RadarCore.fieldDate(p))>=start && RadarCore.fieldDate(p)<=today && RadarCore.availableDate(p)<=today))for(const party of parties.filter(p=>enabled.has(p))){
 const value=p.resultados[party];if(!Number.isFinite(value))continue;
 const dot=create('circle',{cx:x(RadarCore.fieldDate(p)),cy:y(value),r:2.2,stroke:'transparent','stroke-width':7,fill:colors[party]||'#68786c','fill-opacity':.22,'data-poll':p.estudio_id,'data-party':party,tabindex:0,'aria-label':RadarCore.pollTooltip(p,party)});
 const hover=event=>{event.stopPropagation();showTip(event,RadarCore.pollTooltip(p,party));};dot.addEventListener('pointerenter',hover);dot.addEventListener('pointermove',hover);dot.addEventListener('click',hover);
 dot.addEventListener('focus',()=>{const r=dot.getBoundingClientRect();showTip({clientX:r.x,clientY:r.y},RadarCore.pollTooltip(p,party));});dot.addEventListener('blur',()=>tip.hidden=true);svg.append(dot);
}
svg.addEventListener('keydown',event=>{if(event.key==='Escape')tip.hidden=true;});svg.addEventListener('pointerleave',()=>tip.hidden=true);tip.hidden=true;
box.replaceChildren(svg,latest);
const privateCount=polls.filter(p=>RadarCore.normalizeInstitute(p.instituto)!=='CIS').length;
status.textContent=`${polls.length} encuestas disponibles · ${privateCount} privadas${cis.checked?' + '+(polls.length-privateCount)+' CIS':' · CIS excluido'} · ${new Set(polls.map(p=>p.instituto)).size} institutos`;

summary.textContent=`Fuentes y fichas de las ${polls.length} encuestas seleccionadas`;
sourceRows.replaceChildren();for(const p of polls){const row=document.createElement('p'),link=document.createElement('a');setSource(link,p.fuente);link.textContent=`${p.instituto} · ${RadarCore.fieldDate(p)}${p.fecha_publicacion?'':'*'} · publicación ${p.fecha_publicacion??'no consta'} · campo ${p.trabajo_campo_inicio}–${p.trabajo_campo_fin} · n=${p.tamano_muestra??'no disponible'} · ${p.estudio_id}`;link.target='_blank';link.rel='noopener noreferrer';row.append(link);for(const url of [...new Set([p.url_electografica,...(p.fuentes_adicionales||[]).filter(f=>f.source==='electografica').map(f=>f.url)].filter(Boolean))]){const extra=document.createElement('a');if(!setSource(extra,url))continue;extra.textContent=' · Electográfica';extra.target='_blank';extra.rel='noopener noreferrer';row.append(extra);}sourceRows.append(row);}
}
function setSource(link,url){
 try{const parsed=new URL(url);if(parsed.protocol!=='https:' && parsed.protocol!=='http:')return false;link.href=parsed.href;return true;}catch{return false;}
}
const attribution=document.createElement('p');attribution.className='sub';sourceBox.before(attribution);
const interval=600000;
let lastAttempt=0, pending=false;
async function refresh(){
 if(pending)return;
 pending=true;
 lastAttempt=Date.now();
 try{
  const response=await fetch('https://raw.githubusercontent.com/danicolado95/observatorio-electoral/radar-pruebas/data/radar.json?t='+lastAttempt,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('HTTP '+response.status);
  const next=await response.json();
  if(!Array.isArray(next.encuestas)||!next.encuestas.length||!next.encuestas.every(p=>p && typeof p.instituto==='string' && p.instituto.trim() && p.resultados && typeof p.resultados==='object' && /^\d{4}-\d{2}-\d{2}$/.test(RadarCore.fieldDate(p))))throw Error('Formato inválido');
  data=next;
  updateParties(data.encuestas);
  draw();
  attribution.textContent='Datos derivados de Wikipedia y Electográfica. ';
  for(const [title,url] of [['Revisión de Wikipedia',data.attribution?.revision],['Historial',data.attribution?.history],['CC BY-SA 4.0',data.attribution?.license]]){
   const link=document.createElement('a');
   if(setSource(link,url)){link.textContent=title;attribution.append(link,document.createTextNode(' · '));}
  }
 }catch{
  status.textContent=data?'No se pudo actualizar. Se muestran las últimas encuestas cargadas.':'No se pudieron cargar las encuestas.';
 }finally{pending=false;}
}
cis.addEventListener('change',draw);
let compactLayout;
new ResizeObserver(()=>{
 const next=box.clientWidth<600;
 if(next===compactLayout)return;
 compactLayout=next;
 if(data)draw();
}).observe(box);
function refreshIfDue(){if(!document.hidden && Date.now()-lastAttempt>=interval)refresh();}
document.addEventListener('visibilitychange',refreshIfDue);
setInterval(refreshIfDue,30000);
refresh();
})();
