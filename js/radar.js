(async()=>{
const box=document.getElementById('radar-grafico'),status=document.getElementById('radar-status');
const create=(tag,attrs={},text='')=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);n.textContent=text;return n;};
try{
const response=await fetch('./data/radar.json',{cache:'no-store'});
if(!response.ok)throw Error('HTTP '+response.status);
const data=await response.json(),state=data.status;
if(!state)throw Error('Radar sin estado integrado; ejecutar scripts/update.mjs');
function draw(){
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'}).format(new Date());
const polls=RadarCore.select(data.encuestas,document.getElementById('radar-cis').checked);
const colors={PP:'#347cbd',PSOE:'#e54440',VOX:'#69a554',SUMAR:'#d36a9d',PODEMOS:'#8541b5'};
const parties=[...new Set([...Object.keys(colors),...polls.flatMap(p=>Object.keys(p.resultados))])];
const svg=create('svg',{viewBox:'0 0 800 370',width:'100%',role:'img','aria-label':'Radar descriptivo desde el 23J'});
const start=Date.parse('2023-07-23'),end=Math.max(start+86400000,Date.parse(today));
const x=d=>55+(Date.parse(d)-start)/(end-start)*690;
const ceiling=Math.ceil(Math.max(40,...polls.flatMap(p=>Object.values(p.resultados)))/10)*10,y=v=>300-v/ceiling*270;
for(let v=0;v<=ceiling;v+=10)svg.append(create('line',{x1:55,x2:745,y1:y(v),y2:y(v),stroke:'#dce5df'}),create('text',{x:5,y:y(v)+4,'font-size':12},v+'%'));
svg.append(create('text',{x:55,y:330,'font-size':12},'23J 2023'),create('text',{x:710,y:330,'font-size':12},today));
for(let year=2024;year<Number(today.slice(0,4))+1;year++)if(year+'-01-01'<today)svg.append(create('text',{x:x(year+'-01-01'),y:350,'font-size':12},String(year)));
for(const [p,v]of Object.entries({PP:33.1,PSOE:31.7,VOX:12.4,SUMAR:12.3})){const mark=create('rect',{x:51,y:y(v)-4,width:8,height:8,fill:colors[p]});mark.append(create('title',{},`${p}: ${v}% · referencia redondeada heredada del prototipo; contraste nacional pendiente`));svg.append(mark);}
for(const party of parties){const color=colors[party]||'#68786c';let segment=[];const flush=()=>{if(segment.length>1)svg.append(create('polyline',{points:segment.join(' '),fill:'none',stroke:color,'stroke-width':2}));segment=[];};
const observaciones = polls
  .filter(p => Number.isFinite(p.resultados[party]))
  .sort((a, b) =>
    a.trabajo_campo_fin.localeCompare(b.trabajo_campo_fin)
  );

const puntos = observaciones.map(p =>
  `${x(p.trabajo_campo_fin)},${y(p.resultados[party])}`
);

if (puntos.length > 1) {
  svg.append(create('polyline', {
    points: puntos.join(' '),
    fill: 'none',
    stroke: color,
    'stroke-width': 2,
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round'
  }));
}
for(const p of polls.filter(p=>Number.isFinite(p.resultados[party]))){const dot=create('circle',{cx:x(p.trabajo_campo_fin),cy:y(p.resultados[party]),r:4,fill:color,tabindex:0});dot.append(create('title',{},`${party}: ${p.resultados[party]}% · ${p.instituto} · campo ${p.trabajo_campo_inicio}–${p.trabajo_campo_fin} · publicación ${p.fecha_publicacion} · n=${p.tamano_muestra} · ${p.fuente}`));svg.append(dot);}}
const legend=document.createElement('p');legend.textContent=parties.join(' · ')+' | Cuadrados: referencia 23J redondeada del prototipo, pendiente de contraste nacional. Círculos: sondeos al fin del trabajo de campo.';box.replaceChildren(svg,legend);
status.textContent=`Estado: ${state.state}. Intento: ${state.lastAttempt||'ninguno'}. Éxito: ${state.lastSuccess||'ninguno'}. Cambio de datos: ${state.lastDataChange||'ninguno'}. ${polls.length} sondeos visibles. ${state.message}`;
if(state.lastSuccess&&Date.now()-Date.parse(state.lastSuccess)>48*3600000)status.textContent+=' Atención: más de 48 horas sin comprobación satisfactoria.';
const sources=document.getElementById('radar-sources');sources.replaceChildren();for(const p of polls){const row=document.createElement('p'),link=document.createElement('a');link.href=p.fuente;link.textContent=`${p.instituto} · ${p.fecha_publicacion} · ${p.estudio_id}`;link.target='_blank';link.rel='noopener noreferrer';row.append(link);sources.append(row);}
}
document.getElementById('radar-cis').addEventListener('change',draw);draw();
}catch(e){status.textContent='Error de carga del radar: '+e.message;}
})();
