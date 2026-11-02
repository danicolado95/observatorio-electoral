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
