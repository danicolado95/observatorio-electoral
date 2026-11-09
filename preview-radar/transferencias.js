const section = document.querySelector('#transferencias');
const partySelect = section.querySelector('select');
const modes = [...section.querySelectorAll('[data-mode]')];
const chart = section.querySelector('.transfer-chart');
const stack = section.querySelector('.transfer-stack');
const toggle = section.querySelector('#transfer-toggle');
const sample = section.querySelector('#transfer-sample');
const question = section.querySelector('#transfer-question');
const baseNote = section.querySelector('#transfer-base');
const limited = section.querySelector('#transfer-limited');
const parties = [
  ['PSOE', 'PSOE', '#be3944'],
  ['PP', 'PP', '#247ac3'],
  ['VOX', 'VOX', '#4e7943'],
  ['Sumar', 'Sumar / Frente Amplio', '#a74783'],
  ['Podemos', 'Podemos', '#77509d'],
  ['Se Acabó la Fiesta', 'Se Acabó la Fiesta', '#66562e']
];
const format = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const partyColors = new Map(parties.map(([key, , color]) => [key, color]));
const categoryColors = new Map([
  ['No sabe todavía', '#8b8276'],
  ['No votaría', '#536878'],
  ['No votó', '#536878'],
  ['No tenía edad', '#358178'],
  ['No tenía derecho a voto', '#527c87'],
  ['Sin respuesta (N.C.)', '#7b7389'],
  ['No recuerda (N.R.)', '#757b85']
]);
const alwaysVisible = new Set([
  ...partyColors.keys(), 'No sabe todavía', 'No votaría', 'No votó', 'N.C.', 'N.R.'
]);
let mode = 'destino';
let expanded = false;

function element(tag, content, className) {
  const node = document.createElement(tag);
  node.textContent = content;
  if (className) node.className = className;
  return node;
}

function movement(label, party) {
  if (label === party) return 'Fidelidad';
  if (label === 'No votó') return 'Movilización declarada';
  if (label.startsWith('No tenía')) return 'Incorporación';
  if (['N.C.', 'N.R.'].includes(label)) return 'Sin respuesta';
  if (/^(No |En blanco|Nulo|Voto nulo)/.test(label)) return '';
  return 'Transferencia';
}

function render(cells) {
  const [party, name] = parties[partySelect.selectedIndex];
  const hasOrigin = cells.some(row => row.origen === party);
  if (!hasOrigin) mode = 'origen';
  modes[0].disabled = !hasOrigin;
  limited.hidden = hasOrigin;
  limited.textContent = hasOrigin ? '' : name + ' no concurrió con candidatura propia en 2023. Solo se muestra el recuerdo de voto de sus votantes actuales.';
  for (const button of modes) button.setAttribute('aria-pressed', button.dataset.mode === mode);

  const outgoing = mode === 'destino';
  const groupKey = outgoing ? 'origen' : 'destino';
  const labelKey = outgoing ? 'destino' : 'origen';
  const group = cells.filter(row => row[groupKey] === party);
  const n = group.reduce((sum, row) => sum + row.n, 0);
  const weight = group.reduce((sum, row) => sum + row.peso_total, 0);
  const squared = group.reduce((sum, row) => sum + row.peso_cuadrado, 0);
  const percentOf = row => 100 * row.peso_total / weight;
  const other = { [labelKey]: outgoing ? 'Otros destinos' : 'Otros orígenes', n: 0, peso_total: 0 };
  const rows = group.filter(row => {
    const label = row[labelKey];
    if (expanded || alwaysVisible.has(label) || percentOf(row) >= 2
      || (!outgoing && label.startsWith('No tenía'))) return true;
    other.n += row.n;
    other.peso_total += row.peso_total;
    return false;
  }).sort((a, b) => b.peso_total - a.peso_total || a[labelKey].localeCompare(b[labelKey], 'es'));
  if (other.peso_total > 0) rows.push(other);

  question.textContent = outgoing
    ? '¿Qué votan ahora quienes votaron a ' + party + ' en 2023?'
    : '¿Qué votaron en 2023 quienes hoy elegirían a ' + name + '?';
  baseNote.textContent = outgoing
    ? 'El 100 % son quienes recuerdan haber votado a ' + party + ' en 2023.'
    : 'El 100 % son quienes declaran que hoy votarían a ' + name + '.';
  sample.textContent = 'Base de esta vista · ' + format.format(n) + ' entrevistas · n efectivo '
    + format.format(weight ** 2 / squared) + '.';
  const noun = outgoing ? 'destinos' : 'orígenes';
  toggle.textContent = expanded ? 'Mostrar resumen' : 'Ver todos los ' + noun;
  toggle.hidden = !expanded && other.peso_total === 0;
  toggle.setAttribute('aria-expanded', expanded);
  stack.hidden = false;
  const presentation = rows.map(row => {
    const label = row[labelKey];
    const display = ({ 'N.C.': 'Sin respuesta (N.C.)', 'N.R.': 'No recuerda (N.R.)' })[label]
      ?? (outgoing && label === 'Sumar' ? 'Sumar / Frente Amplio' : label);
    const value = percentOf(row);
    const percent = value > 0 && value < 0.05 ? '<0,1 %' : format.format(value) + ' %';
    return { row, label, display, value, percent,
      color: partyColors.get(label) ?? categoryColors.get(display) ?? '#a99d86' };
  });
  stack.replaceChildren(...presentation.map(({ display, value, percent, color }) => {
    const segment = element('span', '', 'transfer-segment');
    segment.style.width = value + '%';
    segment.style.backgroundColor = color;
    segment.title = display + ' · ' + percent;
    return segment;
  }));
  chart.replaceChildren(...presentation.map(({ row, label, display, value, percent, color }, index) => {
    const item = element('li', '', 'transfer-row');
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const kind = row === other ? '' : movement(label, party);
    const labelNode = element('span', display);
    if (kind) labelNode.append(element('small', kind));
    const track = element('span', '', 'transfer-track');
    track.setAttribute('aria-hidden', 'true');
    const fill = element('span', '', 'transfer-fill');
    fill.style.setProperty('--transfer-color', color);
    fill.style.width = value + '%';
    track.append(fill);
    summary.append(labelNode, track, element('strong', percent));
    const tooltip = element('span', 'n: ' + row.n + ' · Peso de la celda: ' + format.format(row.peso_total)
      + ' · Base ponderada del grupo: ' + format.format(weight), 'transfer-detail');
    summary.setAttribute('aria-describedby', 'transfer-detail-' + labelKey + '-' + index);
    tooltip.id = summary.getAttribute('aria-describedby');
    details.append(summary, tooltip);
    details.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        details.open = false;
      }
    });
    item.append(details);
    return item;
  }));
}

async function loadTransfers() {
  try {
    const response = await fetch('data/transferencias_3582.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const { celdas } = await response.json();
    partySelect.replaceChildren(...parties.map(([key, label]) => new Option(label, key)));
    partySelect.addEventListener('change', () => {
      expanded = false;
      render(celdas);
    });
    toggle.addEventListener('click', () => {
      expanded = !expanded;
      render(celdas);
    });
    for (const button of modes) button.addEventListener('click', () => {
      expanded = false;
      mode = button.dataset.mode;
      render(celdas);
    });
    render(celdas);
    section.querySelector('.transfer-controls').hidden = false;
  } catch (error) {
    baseNote.textContent = 'No se han podido cargar las transferencias del CIS 3582.';
    console.warn('Transferencias CIS 3582', error);
  }
}

loadTransfers();
