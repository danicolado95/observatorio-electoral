/* CIS 3582: display R exports verbatim; never derive percentages from counts. */
(() => {
'use strict';
const dimensions = [
  {
    "key": "edad",
    "label": "Edad",
    "categories": [
      "18-24",
      "25-34",
      "35-44",
      "45-54",
      "55-64",
      "65+"
    ]
  },
  {
    "key": "sexo",
    "label": "Sexo",
    "categories": [
      "Hombre",
      "Mujer"
    ]
  },
  {
    "key": "estudios",
    "label": "Estudios",
    "categories": [
      "Sin estudios",
      "Primaria",
      "Secundaria 1ª etapa",
      "Secundaria 2ª etapa",
      "Formación Profesional",
      "Estudios superiores",
      "Otros"
    ]
  },
  {
    "key": "ideologia",
    "label": "Ideología",
    "categories": [
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10"
    ]
  },
  {
    "key": "situacion_laboral",
    "label": "Situación laboral",
    "categories": [
      "Trabaja",
      "Jubilado/a",
      "Pensionista sin empleo previo",
      "En paro, trabajó antes",
      "En paro, primer empleo",
      "Estudiante",
      "Trabajo doméstico no remunerado",
      "Otra situación"
    ]
  },
  {
    "key": "ingresos_hogar",
    "label": "Ingresos del hogar",
    "categories": [
      "Menos de 1.100 €",
      "1.100-1.800 €",
      "1.801-2.700 €",
      "2.701-3.900 €",
      "3.901-5.000 €",
      "Más de 5.000 €"
    ]
  },
  {
    "key": "clase_social",
    "label": "Clase social subjetiva",
    "categories": [
      "Alta y media-alta",
      "Media-media",
      "Media-baja",
      "Trabajadora/obrera",
      "Baja/pobre",
      "Otras"
    ]
  },
  {
    "key": "religion",
    "label": "Religión",
    "categories": [
      "Católico/a practicante",
      "Católico/a no practicante",
      "Otra religión",
      "Agnóstico/a",
      "Indiferente/no creyente",
      "Ateo/a"
    ]
  },
  {
    "key": "tamano_municipio",
    "label": "Tamaño del municipio",
    "categories": [
      "Hasta 2.000",
      "2.001-10.000",
      "10.001-50.000",
      "50.001-100.000",
      "100.001-400.000",
      "400.001-1.000.000",
      "Más de 1.000.000"
    ]
  }
];
const parties = ['PSOE','PP','VOX','SUMAR / Frente Amplio','Podemos','SALF'];
const general = 'Electorado general';
const colors = {'PSOE':'#e4484f','PP':'#247ac3','VOX':'#609b56','SUMAR / Frente Amplio':'#d259a1','Podemos':'#8253b8','SALF':'#a99d86',[general]:'#8aa499'};
const fmt = new Intl.NumberFormat('es-ES',{maximumFractionDigits:2});
const byId = id => document.getElementById(id);
const selectors = ['profile-party','profile-compare','profile-dim'];
let data = null;
function option(value,label=value) { return new Option(label,value); }
function validate(d) {
 if(d.metadata?.estudio!==3582 || d.metadata.ponderacion!=='PESO' || d.metadata.variable_voto!=='INTENCIONGR' || !Number.isInteger(d.metadata.entrevistas) || d.metadata.entrevistas<=0) throw Error('Metadatos incompatibles');
 for(const dim of dimensions) {
  const rows=d[dim.key];
  if(!Array.isArray(rows) || rows.length!==7*dim.categories.length) throw Error('Estructura incompleta: '+dim.key);
  for(const party of [...parties,general]) {
   const group=rows.filter(r=>r.partido===party);
   if(group.length!==dim.categories.length) throw Error('Electorado incompleto: '+party);
   for(const cat of dim.categories) {
    const matches=group.filter(r=>r.categoria===cat);
    if(matches.length!==1) throw Error('Categoría ausente o duplicada: '+cat);
    const r=matches[0];
    if(!Number.isFinite(r.porcentaje) || r.porcentaje<0 || r.porcentaje>100 || !Number.isInteger(r.n) || r.n<0 || !Number.isInteger(r.n_total) || r.n_total<=0 || r.n>r.n_total || !Number.isFinite(r.n_efectivo) || r.n_efectivo<=0 || r.n_efectivo>r.n_total) throw Error('Valor inválido');
   }
   if(group.some(r=>r.n_total!==group[0].n_total || r.n_efectivo!==group[0].n_efectivo) || group.reduce((s,r)=>s+r.n,0)!==group[0].n_total || Math.abs(group.reduce((s,r)=>s+r.porcentaje,0)-100)>0.051) throw Error('Base o distribución inconsistente');
  }
 }
 if(!Array.isArray(d.medias_ideologicas) || d.medias_ideologicas.length!==7) throw Error('Medias incompletas');
 for(const party of [...parties,general]) {
  const means=d.medias_ideologicas.filter(r=>r.partido===party);
  if(means.length!==1 || !Number.isFinite(means[0].media) || means[0].media<1 || means[0].media>10) throw Error('Media inválida');
 }
}
function draw(party,dim,target,sample) {
 const group=data[dim.key].filter(r=>r.partido===party);
 byId(target).replaceChildren(...dim.categories.map(cat=>{
  const r=group.find(row=>row.categoria===cat);
  const row=document.createElement('div'); row.className='profile-row';
  const label=document.createElement('span'); label.textContent=r.categoria;
  const track=document.createElement('div'); track.className='track'; track.setAttribute('aria-hidden','true');
  const bar=document.createElement('div'); bar.className='bar'; bar.style.setProperty('--c',colors[party]); bar.style.width=r.porcentaje+'%'; track.append(bar);
  const value=document.createElement('b'); value.style.textAlign='right'; value.textContent=fmt.format(r.porcentaje)+' %';
  row.title=r.categoria+': '+fmt.format(r.porcentaje)+' % · n = '+fmt.format(r.n)+' (sin ponderar)';
  row.append(label,track,value); return row;
 }));
 const first=group[0];
 const note=byId(sample);
 note.textContent='Base válida sin ponderar: n = '+fmt.format(first.n_total)+' · n efectivo = '+fmt.format(first.n_efectivo)+'.';
 if(dim.key==='ideologia') note.textContent+=' Media ideológica (1–10): '+fmt.format(data.medias_ideologicas.find(r=>r.partido===party).media)+'.';
 // Editorial caution threshold, not a significance test or confidence interval.
 if(first.n_total<100 || first.n_efectivo<100) note.textContent+=' ⚠ Muestra reducida: interpretar con cautela'+(party==='SALF'?', especialmente SALF':'')+'.';
}
window.renderProfile = function() {
 if(!data) return;
 const p=byId('profile-party').value, q=byId('profile-compare').value;
 const dim=dimensions.find(d=>d.key===byId('profile-dim').value);
 byId('profile-title').textContent='Electorado de '+p;
 byId('compare-title').textContent=q===general?general:'Electorado de '+q;
 draw(p,dim,'profile-a','profile-sample-a'); draw(q,dim,'profile-b','profile-sample-b');
};
async function load() {
 selectors.forEach(id=>byId(id).disabled=true);
 byId('profile-status').textContent='Cargando radiografías CIS 3582…';
 try {
  const response=await fetch('./data/radiografias_3582.json',{cache:'no-cache'});
  if(!response.ok) throw Error('HTTP '+response.status);
  const payload=await response.json(); validate(payload); data=payload;
  byId('profile-party').replaceChildren(...parties.map(p=>option(p)));
  byId('profile-compare').replaceChildren(option(general),...parties.map(p=>option(p)));
  byId('profile-dim').replaceChildren(...dimensions.map(d=>option(d.key,d.label)));
  byId('profile-party').value='VOX';
  selectors.forEach(id=>byId(id).disabled=false);
  byId('profile-status').textContent='CIS '+data.metadata.estudio+' · '+fmt.format(data.metadata.entrevistas)+' entrevistas · intención directa de voto (INTENCIONGR) · ponderación PESO.';
  byId('profile-source-tag').textContent='CIS 3582';
  byId('profile-metadata').textContent=data.metadata.nota+' Universo: '+data.metadata.universo+'.';
  window.renderProfile();
 } catch(error) {
  data=null;
  ['profile-a','profile-b','profile-sample-a','profile-sample-b'].forEach(id=>byId(id).replaceChildren());
  byId('profile-source-tag').textContent='Sin datos';
  byId('profile-status').textContent='No se pudieron cargar las radiografías CIS 3582. Recarga la página para reintentar.';
  console.error('Radiografías CIS 3582:',error);
 }
}
load();
})();
