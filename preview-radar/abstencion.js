const section = document.querySelector('#abstencion');
const get = id => section.querySelector('#abs-' + id);
const dataUrl = new URL('../analisis-cis/resultados/abstencion_3582.json', import.meta.url);
const number = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, useGrouping: 'always' });
const variables = {
  EDAD: 'Edad', ESTUDIOS: 'Nivel de estudios', ESCIDEOL: 'Autoubicación ideológica',
  INGRESHOG: 'Ingresos del hogar', ECOPER: 'Situación económica personal',
  SITLAB: 'Situación laboral', CLASESUB: 'Clase social subjetiva'
};
const bands = { '0–3': 'Baja', '4–6': 'Intermedia', '7–9': 'Alta', '10': 'Máxima' };
const bandColors = { '0–3': '#85573c', '4–6': '#c89e75', '7–9': '#9bb9aa', '10': '#3b786e' };
const partyColors = {
  PSOE: '#be3944', PP: '#247ac3', VOX: '#4e7943', Sumar: '#a74783',
  Podemos: '#77509d', SALF: '#66562e'
};

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function percent(value) {
  return value > 0 && value < 0.1 ? '<0,1 %' : number.format(value) + ' %';
}

function sample(base, warn = false) {
  const label = 'n = ' + number.format(base.n) + ' · n efectivo = ' + number.format(base.n_efectivo);
  return warn && (base.n < 100 || base.n_efectivo < 100) ? label + ' · Base pequeña' : label;
}

function bar(label, value, context, color) {
  const row = element('li', undefined, 'abs-bar-row');
  const name = element('span', label);
  if (context) name.append(element('small', context));
  const track = element('span', undefined, 'abs-track');
  const fill = element('span');
  track.setAttribute('aria-hidden', 'true');
  fill.style.width = value + '%';
  if (color) fill.style.backgroundColor = color;
  track.append(fill);
  row.append(name, track, element('strong', percent(value)));
  return row;
}

function exclusionText(exclusions) {
  const codes = exclusions.codigos_excluidos.flat();
  if (!codes.length) return 'Sin exclusiones por código en esta variable.';
  return 'Exclusiones de la variable en la muestra original: ' + codes.map(row =>
    row.etiqueta + ' (' + row.codigo + ', n = ' + number.format(row.n) + ')'
  ).join('; ') + '.';
}

function renderDistribution(data) {
  const { general, por_participacion_2023: byParticipation } = data.distribucion;
  const exclusions = data.metadatos.exclusiones;
  get('general-base').textContent = sample(general.base[0]) + ' · Porcentaje ponderado';
  get('distribution').replaceChildren(...general.distribucion.map(row =>
    bar(row.categoria, row.porcentaje)
  ));
  for (const [label, profile] of Object.entries(byParticipation)) {
    const chart = element('div', undefined, 'abs-comparison-row');
    const stack = element('div', undefined, 'abs-stack');
    const legend = element('ul', undefined, 'abs-stack-legend');
    stack.setAttribute('aria-hidden', 'true');
    for (const row of data.matriz[label].distribucion) {
      const segment = element('span');
      segment.style.width = row.porcentaje + '%';
      segment.style.backgroundColor = bandColors[row.categoria];
      stack.append(segment);

      const key = element('li');
      key.style.setProperty('--abs-band', bandColors[row.categoria]);
      key.append(element('span', row.categoria + ' · ' + bands[row.categoria]), element('strong', percent(row.porcentaje)));
      legend.append(key);
    }
    chart.append(element('h5', label), element('p', sample(profile.base[0]), 'note'), stack, legend);
    get('comparison').append(chart);
  }
  const separately = exclusions.PARTICIPACIONG.codigos_excluidos.flat()
    .filter(row => [3, 4].includes(row.codigo));
  for (const row of separately) {
    get('ineligible-data').append(element('p', row.etiqueta + ' · ' + sample(row, true)));
  }
  get('ineligible-link').addEventListener('click', event => {
    event.preventDefault();
    const details = get('ineligible');
    details.open = true;
    details.querySelector('summary').focus();
  });
  get('source').textContent = 'Microdatos del CIS, estudio ' + data.metadatos.estudio +
    ', octubre de 2026 · ' + number.format(data.metadatos.entrevistas) + ' entrevistas.';
  const otherCodes = exclusions.PARTICIPACIONG.codigos_excluidos.flat().filter(row => [8, 9].includes(row.codigo));
  get('exclusions').textContent = 'La distribución general excluye ' + general.excluidos_probvoto[0].n +
    ' respuestas fuera de 0–10. La comparación y la matriz usan únicamente los códigos 1 y 2 de PARTICIPACIONG. ' +
    'Además de los casos sin edad o derecho, quedan fuera ' +
    otherCodes.map(row => row.n + ' ' + row.etiqueta + ' (código ' + row.codigo + ')').join(' y ') + '.';
}

function connectSwitch(selector, key, render) {
  const buttons = [...section.querySelectorAll(selector)];
  for (const button of buttons) {
    button.addEventListener('click', () => {
      for (const option of buttons) option.setAttribute('aria-pressed', option === button);
      render(button.dataset[key]);
    });
  }
}

function renderSocial(data) {
  const select = get('variable');
  for (const [key, label] of Object.entries(variables)) select.add(new Option(label, key));
  let rate = 'baja';

  function update() {
    const variable = select.value;
    const profiles = data.explorador_social[variable];
    const mapping = data.metadatos.mapeo[variable];
    const labels = variable === 'ESCIDEOL' ? { '1': '1 · Izquierda', '10': '10 · Derecha' } : {};
    get('social').replaceChildren(...mapping.map(({ categoria }) => {
      const profile = profiles[categoria];
      return bar(labels[categoria] ?? categoria, profile[rate][0].porcentaje, sample(profile.base[0], true));
    }));
    const details = element('ul');
    for (const { categoria, codigos } of mapping) {
      const codes = [codigos].flat();
      const description = variable === 'EDAD'
        ? labels[categoria] ?? categoria
        : (labels[categoria] ?? categoria) + ' · ' + (codes.length === 1 ? 'código ' : 'códigos ') + codes.join(', ');
      details.append(element('li', description));
    }
    const excludedScores = Object.values(profiles).reduce((sum, row) => sum + row.excluidos_probvoto[0].n, 0);
    get('social-method').replaceChildren(
      details, element('p', exclusionText(data.metadatos.exclusiones[variable])),
      element('p', 'Entrevistas adicionales fuera de la escala 0–10 en estos grupos: ' + excludedScores + '.')
    );
  }

  select.addEventListener('change', update);
  connectSwitch('[data-abs-rate]', 'absRate', value => {
    rate = value;
    update();
  });
  update();
}

function renderMatrix(matrix) {
  const matrixNode = get('matrix');
  const buttons = [];

  function showIntention(button, participation, band, detail) {
    for (const cell of buttons) cell.setAttribute('aria-pressed', cell === button);
    get('intention-title').textContent = participation + ' · ' + band + ' (' + bands[band].toLowerCase() + ')';
    get('intention-base').textContent = sample(detail.base[0], true) + ' · Porcentaje dentro de la celda';
    get('intention-rows').replaceChildren(...detail.distribucion.map(row => bar(row.categoria, row.porcentaje)));
  }

  for (const [participation, profile] of Object.entries(matrix)) {
    const group = element('fieldset', undefined, 'abs-matrix-row');
    group.append(element('legend', participation), element('p', sample(profile.base[0]), 'note'));
    const cells = element('div', undefined, 'abs-matrix-cells');
    for (const row of profile.distribucion) {
      const band = row.categoria;
      const button = element('button', undefined, 'abs-cell');
      button.type = 'button';
      button.setAttribute('aria-controls', 'abs-intention');
      button.setAttribute('aria-pressed', 'false');
      button.style.setProperty('--abs-band', bandColors[band]);
      button.append(element('span', band), element('span', bands[band]), element('strong', percent(row.porcentaje)));
      button.addEventListener('click', () => showIntention(button, participation, band, profile.intencion_por_disposicion[band]));
      cells.append(button);
      buttons.push(button);
    }
    group.append(cells);
    matrixNode.append(group);
  }
  buttons[0].click();
}

function renderParties(data, mode) {
  const profiles = data.electorados[mode];
  const intention = mode === 'por_intencion';
  get('parties').replaceChildren(...Object.entries(profiles).map(([party, profile]) => {
    const label = party === 'Sumar' && intention ? 'Sumar / Frente Amplio' : party;
    const item = element('li', undefined, 'abs-party');
    const title = element('h4', label);
    title.style.borderLeftColor = partyColors[party];
    const rates = element('ul', undefined, 'abs-list');
    rates.append(
      bar('10/10 · Máxima', profile.maxima[0].porcentaje, null, partyColors[party]),
      bar('0–3 · Baja', profile.baja[0].porcentaje, null, partyColors[party])
    );
    item.append(title, element('p', sample(profile.base[0], true), 'note'), rates);
    return item;
  }));
  get('party-method').textContent = intention
    ? 'Sumar / Frente Amplio corresponde al código 21 de INTENCIONGR. «Coalición de izquierdas» (29) queda fuera de estos perfiles.'
    : 'Los grupos se definen por el voto que cada persona recuerda haber emitido en las generales de 2023.';
}

async function load() {
  try {
    const response = await fetch(dataUrl);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    renderDistribution(data);
    renderSocial(data);
    renderMatrix(data.matriz);
    renderParties(data, 'por_recuerdo');
    connectSwitch('[data-abs-party]', 'absParty', value => renderParties(data, value));
    get('content').hidden = false;
    get('status').hidden = true;
  } catch (error) {
    get('status').textContent = 'No se han podido cargar los datos de Abstención. Recarga la página para reintentar.';
    console.error(error);
  }
}

load();
