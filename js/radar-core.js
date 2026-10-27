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
  const api = {select, trend, normalizeInstitute};
  if (typeof module !== 'undefined') module.exports = api;
  else root.RadarCore = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
