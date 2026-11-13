/* Display the R export. Do not derive statistics or round before formatting. */
(() => {
'use strict';
const dimensions = [
 ['Edad',['18-24','25-34','35-44','45-54','55-64','65+']],
 ['Sexo',['Hombre','Mujer']],
 ['Ideología',['1','2','3','4','5','6','7','8','9','10']],
 ['Partido',['PSOE','PP','VOX','SUMAR / Frente Amplio','Podemos','SALF']],
 ['Estudios',['Sin estudios','Primaria','Secundaria 1ª etapa','Secundaria 2ª etapa','Formación Profesional','Estudios superiores','Otros']],
 ['Ingresos del hogar',['Menos de 1.100 €','1.100-1.800 €','1.801-2.700 €','2.701-3.900 €','3.901-5.000 €','Más de 5.000 €']]
];
const colors={PP:'#247ac3',PSOE:'#e4484f',VOX:'#609b56','SUMAR / Frente Amplio':'#d259a1',Podemos:'#8253b8',SALF:'#816343'};
const $=id=>document.getElementById(id);
const fmt=new Intl.NumberFormat('es-ES',{maximumFractionDigits:2});
const pct=value=>value>0&&value<0.005?'<0,01 %':fmt.format(value)+' %';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data, selected;
function validate(d){
 if(d?.metadata?.estudio!==3582||d.metadata.entrevistas!==5024||d.metadata.ponderacion!=='PESO'||d.ranking_nacional?.length!==69||d.comparaciones?.length!==2553) throw Error('Catálogo o metadatos incompletos');
 const codes=new Map();const keys=new Set();
 const percent=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100;
 const count=v=>Number.isInteger(v)&&v>=0;
 let previous=Infinity;
 for(const r of d.ranking_nacional){
  if(!Number.isInteger(r.codigo)||codes.has(r.codigo)||typeof r.problema!=='string'||!r.problema.trim()||!percent(r.porcentaje)||r.porcentaje>previous||!count(r.menciones)||r.menciones>5024)throw Error('Ranking inválido');
  codes.set(r.codigo,r);previous=r.porcentaje;
 }
 for(const r of d.comparaciones){
  const national=codes.get(r.codigo);const dim=dimensions.find(([name])=>name===r.dimension);const key=JSON.stringify([r.dimension,r.grupo,r.codigo]);
  if(!national||!dim||!dim[1].includes(r.grupo)||keys.has(key)||r.problema!==national.problema||!percent(r.porcentaje)||!count(r.n)||r.n===0||r.n>5024||typeof r.n_efectivo!=='number'||!Number.isFinite(r.n_efectivo)||r.n_efectivo<=0||r.n_efectivo>r.n+0.000001||!count(r.menciones_grupo)||r.menciones_grupo>r.n||r.menciones_grupo>national.menciones||r.menciones_nacionales!==national.menciones||(r.menciones_grupo===0)!==(r.porcentaje===0))throw Error('Comparación inválida');
  keys.add(key);
 }
 return d;
}
function fillOptions(){
 const query=$('el-search').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const rows=data.ranking_nacional.filter(r=>r.problema.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query));
 $('el-problem').replaceChildren(...rows.map(r=>new Option(r.problema,r.codigo)));
 if(!rows.some(r=>r.codigo===selected))selected=rows[0]?.codigo;
 $('el-problem').value=String(selected);$('el-problem').disabled=!rows.length;
 $('el-results').textContent=rows.length+' de 69 problemas'+(!rows.length?'. Prueba otra búsqueda.':' · orden nacional por porcentaje.');
 $('el-detail').hidden=!rows.length;
 render();
}
function render(){
 document.querySelectorAll('#el-top button').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.code)===selected)));
 const r=data.ranking_nacional.find(r=>r.codigo===selected);if(!r)return;
 const dimension=$('el-dimension').value;
 $('el-title').textContent=r.problema;
 $('el-national').textContent='Resultado nacional: '+pct(r.porcentaje)+' · '+fmt.format(r.menciones)+' menciones en '+fmt.format(data.metadata.entrevistas)+' entrevistas.';
 $('el-vote').hidden=dimension!=='Partido';
 const rare=r.menciones<30;
 $('el-rare').hidden=!rare;$('el-plot').hidden=rare;
 $('el-rows').replaceChildren();
 if(rare){$('el-rare').textContent='Solo '+fmt.format(r.menciones)+' menciones en toda la muestra. Puedes consultar el resultado nacional; no mostramos desgloses por grupos porque aportarían muy poca información.';return;}
 $('el-reference').textContent='Línea discontinua: resultado nacional ('+pct(r.porcentaje)+'). Escala común de 0 a 100 %.';
 const groups=dimensions.find(([name])=>name===dimension)[1];
 for(const group of groups){
  const v=data.comparaciones.find(v=>v.dimension===dimension&&v.grupo===group&&v.codigo===selected);
  const warnings=[];
  if(v.n<100||v.n_efectivo<100)warnings.push('Base pequeña');
  if(v.menciones_grupo<5)warnings.push(v.menciones_grupo===0?'Sin menciones observadas (0 %), no dato ausente':'Muy pocas menciones (<5)');
  else if(v.menciones_grupo<30)warnings.push('Pocas menciones (<30)');
  const row=document.createElement('li');row.className='el-row';
  row.innerHTML=`<span class="el-group">${esc(group)}</span><div class="el-track" aria-hidden="true"><div class="el-bar" style="width:${v.porcentaje}%;background:${colors[group]||'var(--sage)'}"></div><span class="el-ref" style="left:${r.porcentaje}%"></span></div><span class="el-value">${esc(pct(v.porcentaje))}</span><div class="el-base">n = ${fmt.format(v.n)} · n efectivo = ${fmt.format(v.n_efectivo)} · ${fmt.format(v.menciones_grupo)} menciones${warnings.length?' · <span class="el-warning">⚠ '+warnings.map(esc).join(' · ')+'</span>':''}</div>`;
  $('el-rows').append(row);
 }
}
async function load(){
 try{
  const response=await fetch('../analisis-cis/resultados/electorado_3582.json');if(!response.ok)throw Error('HTTP '+response.status);
  data=validate(await response.json());selected=data.ranking_nacional[0].codigo;
  $('el-dimension').replaceChildren(...dimensions.map(([name])=>new Option(name==='Partido'?'Intención directa de voto':name,name)));
  $('el-top').innerHTML=data.ranking_nacional.slice(0,5).map(r=>`<li><button type="button" data-code="${r.codigo}" aria-pressed="false"><span>${esc(r.problema)}</span><strong>${esc(pct(r.porcentaje))}</strong></button></li>`).join('');
  $('el-top').addEventListener('click',event=>{const button=event.target.closest('button[data-code]');if(!button)return;selected=Number(button.dataset.code);$('el-search').value='';fillOptions();$('el-title').scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
  $('el-search').addEventListener('input',fillOptions);
  $('el-problem').addEventListener('change',()=>{selected=Number($('el-problem').value);render();});
  $('el-dimension').addEventListener('change',render);
  fillOptions();$('el-content').hidden=false;$('el-status').textContent='CIS 3582 · 5.024 entrevistas · 69 problemas · Datos ponderados con PESO.';
 }catch(error){$('el-content').hidden=true;$('el-status').textContent='No se pudieron cargar o validar los datos de Electorado. Recarga la página desde un servidor local; no se muestran cifras de ejemplo.';console.warn('Electorado:',error.message);}
}
load();
})();
