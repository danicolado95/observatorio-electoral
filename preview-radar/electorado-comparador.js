/* Render the R export without deriving percentages in the browser. */
(() => {
'use strict';
const $ = id => document.getElementById('el-compare-' + id);
const situations = ['En ambas preguntas', 'Solo como problema de España', 'Solo como problema personal', 'En ninguna'];
const format = new Intl.NumberFormat('es-ES', {maximumFractionDigits: 2});
const signed = new Intl.NumberFormat('es-ES', {maximumFractionDigits: 2, signDisplay: 'exceptZero'});
const pct = value => value > 0 && value < 0.005 ? '<0,01 %' : format.format(value) + ' %';
const gap = value => Math.abs(value) > 0 && Math.abs(value) < 0.005
 ? (value < 0 ? '−' : '+') + '<0,01 pp' : signed.format(value) + ' pp';
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const percent = value => Number.isFinite(value) && value >= 0 && value <= 100;
const count = value => Number.isInteger(value) && value >= 0 && value <= 5024;

function validate(data) {
 const {metadata, ranking_comparado: ranking, solapamientos: overlap} = data;
 if (metadata?.estudio !== 3582 || metadata.entrevistas !== 5024 || metadata.ponderacion !== 'PESO' ||
     !Array.isArray(ranking) || ranking.length !== 72 || !Array.isArray(overlap) || overlap.length !== 288) {
  throw Error('Catálogo incompleto');
 }
 const codes = new Set();
 const byTopic = new Map();
 for (const row of ranking) {
  if (!Number.isInteger(row.codigo) || codes.has(row.codigo) ||
      typeof row.problema !== 'string' || !row.problema.trim() || byTopic.has(row.problema) ||
      !Number.isFinite(row.diferencia_pp) || Math.abs(row.diferencia_pp) > 100 ||
      !['espana', 'personal'].every((key, index) => {
       const mentions = row[index === 0 ? 'menciones_espana' : 'menciones_personales'];
       const value = row['porcentaje_' + key];
       return count(mentions) && percent(value) && (mentions === 0) === (value === 0);
      })) throw Error('Tema inválido');
  codes.add(row.codigo);
  byTopic.set(row.problema, new Map());
 }
 for (const row of overlap) {
  const topic = byTopic.get(row.problema);
  if (!topic || !situations.includes(row.situacion) || topic.has(row.situacion) ||
      !count(row.n) || !percent(row.porcentaje) || (row.n === 0) !== (row.porcentaje === 0)) {
   throw Error('Solapamiento inválido');
  }
  topic.set(row.situacion, row);
 }
 return {ranking: [...ranking].sort((a, b) => Math.abs(b.diferencia_pp) - Math.abs(a.diferencia_pp)), byTopic};
}

function bar(label, value, n, unit) {
 const item = document.createElement('li');
 item.innerHTML = '<div class="el-compare-bar-label"><span></span><strong class="el-value"></strong></div>' +
  '<div class="el-track" aria-hidden="true"><div class="el-bar"></div></div><small></small>';
 item.querySelector('span').textContent = label;
 item.querySelector('strong').textContent = pct(value);
 item.querySelector('.el-bar').style.width = value + '%';
 const base = item.querySelector('small');
 base.textContent = format.format(n) + ' ' + unit;
 if (n === 0) base.textContent += ' · Cero observado';
 else if (n < 30) base.textContent += ' · Cautela: menos de 30 casos';
 if (n < 30) base.className = 'el-warning';
 return item;
}

function setup({ranking, byTopic}) {
 let selected = ranking[0];
 const buttons = new Map();
 function render() {
  $('detail').hidden = !selected;
  for (const [row, button] of buttons) button.setAttribute('aria-pressed', String(row === selected));
  if (!selected) return;
  $('topic').textContent = selected.problema;
  const diff = selected.diferencia_pp;
  $('gap').textContent = diff === 0 ? 'Mismo porcentaje en ambas preguntas (0 pp).' :
   'España − personal: ' + gap(diff) + (diff > 0 ? ' · Más citado como problema de España.' : ' · Más citado como problema personal.');
  $('bars').replaceChildren(
   bar('Problemas de España', selected.porcentaje_espana, selected.menciones_espana, selected.menciones_espana === 1 ? 'mención' : 'menciones'),
   bar('Problemas personales', selected.porcentaje_personal, selected.menciones_personales, selected.menciones_personales === 1 ? 'mención' : 'menciones')
  );
  const overlap = byTopic.get(selected.problema);
  $('overlap').replaceChildren(...situations.map(label => {
   const row = overlap.get(label);
   return bar(label, row.porcentaje, row.n, row.n === 1 ? 'persona' : 'personas');
  }));
 }

 function search() {
  const query = normalize($('search').value);
  const matches = ranking.filter(row => normalize(row.problema).includes(query));
  if (!matches.includes(selected)) selected = matches[0];
  $('problem').replaceChildren(...matches.map(row => new Option(row.problema, row.codigo)));
  if (selected) $('problem').value = String(selected.codigo);
  $('problem').disabled = !matches.length;
  $('results').textContent = matches.length + ' de 72 temas' + (matches.length ? '.' : '. Prueba otra búsqueda.');
  render();
 }

 for (const row of ranking) {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  const label = document.createElement('span');
  label.textContent = row.problema;
  const value = document.createElement('strong');
  value.textContent = gap(row.diferencia_pp);
  button.append(label, value);
  button.addEventListener('click', () => {
   selected = row;
   $('search').value = '';
   search();
   $('problem').focus();
  });
  buttons.set(row, button);
  item.append(button);
  $('ranking').append(item);
 }
 $('search').addEventListener('input', search);
 $('problem').addEventListener('change', () => {
  selected = ranking.find(row => String(row.codigo) === $('problem').value);
  render();
 });
 search();
}

async function load() {
 try {
  const response = await fetch('../analisis-cis/resultados/electorado_personales_3582.json');
  if (!response.ok) throw Error('HTTP ' + response.status);
  setup(validate(await response.json()));
  $('content').hidden = false;
  $('status').textContent = '';
 } catch (error) {
  $('status').textContent = 'Datos del comparador no disponibles o incompletos. Recarga la vista local para volver a intentarlo.';
  console.warn('Comparador de Electorado:', error.message);
 }
}
load();
})();
