const section = document.querySelector('#transferencias');
const partySelect = section.querySelector('select');
const modes = [...section.querySelectorAll('[data-mode]')];
const chart = section.querySelector('.transfer-chart');
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
let mode = 'destino';

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
  const [party, name, color] = parties[partySelect.selectedIndex];
  const hasOrigin = cells.some(row => row.origen === party);
  if (!hasOrigin) mode = 'origen';
  modes[0].disabled = !hasOrigin;
  limited.hidden = hasOrigin;
  limited.textContent = hasOrigin ? '' : name + ' no concurrió con candidatura propia en 2023. Puedes consultar de dónde vienen sus votantes actuales.';
  for (const button of modes) button.setAttribute('aria-pressed', button.dataset.mode === mode);

  const outgoing = mode === 'destino';
  const groupKey = outgoing ? 'origen' : 'destino';
  const labelKey = outgoing ? 'destino' : 'origen';
  const percentKey = outgoing ? 'pct_destino' : 'pct_origen';
  const rows = cells.filter(row => row[groupKey] === party)
    .sort((a, b) => b[percentKey] - a[percentKey] || a[labelKey].localeCompare(b[labelKey], 'es'));
  const n = rows.reduce((sum, row) => sum + row.n, 0);
  const weight = rows.reduce((sum, row) => sum + row.peso_total, 0);
  const squared = rows.reduce((sum, row) => sum + row.peso_cuadrado, 0);
  const effective = weight ** 2 / squared;
  question.textContent = outgoing
    ? 'Intención actual de quienes recuerdan haber votado a ' + party + ' en 2023'
    : 'Recuerdo de voto de 2023 entre quienes hoy elegirían a ' + name;
  baseNote.textContent = 'Base: ' + format.format(n) + ' entrevistas · n efectivo: ' + format.format(effective)
    + ' · Interpreta con cautela las estimaciones con pocos casos.';
  chart.style.setProperty('--transfer-color', color);
  chart.replaceChildren(...rows.map((row, index) => {
    const label = row[labelKey];
    const value = row[percentKey];
    const percent = value > 0 && value < 0.05 ? '<0,1 %' : format.format(value) + ' %';
    const item = element('li', '', 'transfer-row');
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const kind = movement(label, party);
    const labelNode = element('span', outgoing && label === 'Sumar' ? 'Sumar / Frente Amplio' : label);
    if (kind) labelNode.append(element('small', kind));
    const track = element('span', '', 'transfer-track');
    track.setAttribute('aria-hidden', 'true');
    const fill = element('span', '', 'transfer-fill');
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
    partySelect.addEventListener('change', () => render(celdas));
    for (const button of modes) button.addEventListener('click', () => {
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
