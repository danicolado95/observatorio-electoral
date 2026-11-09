const perspectives = { Espana: 'España', Personal: 'Personal' };
const notes = {
  33: 'Servicios públicos y recortes. La etiqueta cambia entre falta de servicios y falta de recursos.',
  42: 'Tarifas energéticas. Algunas etiquetas incluyen también la crisis energética.',
  82: 'Agua y sequía. La formulación cambia entre problemas relacionados con el agua y escasez de agua.',
};
const breaks = new Set([73, 90, 91, 93]);
const dateFormat = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeZone: 'UTC' });
const numberFormat = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

export function prepareHistory(rows) {
  const studies = new Map();
  const series = new Map();
  for (const row of rows) {
    if (!perspectives[row.perspectiva]) throw new Error('Perspectiva desconocida');
    studies.set(row.estudio, row.fecha_fin);
    if (/^(?:n\.?\s*[sc]\.?|no sabe|no contesta|no responde|ningun[oa]?)\b/i.test(row.etiqueta.trim())) continue;
    if (!series.has(row.serie_id)) {
      series.set(row.serie_id, { id: row.serie_id, code: row.codigo, points: { Espana: new Map(), Personal: new Map() } });
    }
    const topic = series.get(row.serie_id);
    if (!topic.date || row.fecha_fin >= topic.date) {
      topic.label = row.etiqueta;
      topic.date = row.fecha_fin;
    }
    const points = topic.points[row.perspectiva];
    if (points.has(row.estudio)) throw new Error('Estimación duplicada');
    if (Number.isFinite(row.porcentaje)) points.set(row.estudio, row);
  }
  const timeline = [...studies].map(([id, date]) => ({ id, date, time: Date.parse(date) }))
    .sort((a, b) => a.time - b.time || a.id - b.id);
  return { series, timeline };
}

export function latestTop(history, mode) {
  const latest = history.timeline.at(-1).id;
  const top = perspective => [...history.series.values()]
    .filter(topic => topic.points[perspective].has(latest))
    .sort((a, b) => b.points[perspective].get(latest).porcentaje - a.points[perspective].get(latest).porcentaje ||
      a.label.localeCompare(b.label, 'es'))
    .slice(0, 5).map(topic => topic.id);
  return mode === 'both' ? [...new Set([...top('Espana'), ...top('Personal')])] : top(mode);
}

export function segments(timeline, points) {
  const runs = [];
  let run = [];
  for (const study of timeline) {
    const row = points.get(study.id);
    if (row) {
      if (!run.length) runs.push(run);
      run.push({ time: study.time, value: row.porcentaje });
    } else {
      run = [];
    }
  }
  return runs;
}

function element(tag, text, parent) {
  const node = document.createElement(tag);
  node.textContent = text;
  parent.append(node);
  return node;
}

function svgElement(parent, tag, attributes, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text) node.textContent = text;
  parent.append(node);
  return node;
}

function searchable(text) {
  return text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function mount(root, history) {
  const get = name => root.querySelector('[data-history="' + name + '"]');
  const mode = get('mode');
  const search = get('search');
  const choices = get('choices');
  const chart = get('chart');
  const cursor = get('date');
  const legend = get('legend');
  const detail = get('detail');
  const warnings = get('warnings');
  const status = get('status');
  const { series, timeline } = history;
  const sorted = [...series.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));
  const colors = new Map();
  const palette = ['#075d82', '#a13e13', '#62409b', '#21673d', '#a12958', '#675c13', '#0b7371', '#943323'];
  let custom = null;
  let selected = [];
  let linePerspectives = [];
  let marker;
  let xFor;
  let chartWidth = 360;
  cursor.max = timeline.length - 1;
  cursor.value = cursor.max;

  function color(id) {
    if (!colors.has(id)) {
      const index = colors.size;
      colors.set(id, palette[index] ?? 'hsl(' + Math.round(index * 137.508 % 360) + ' 64% 32%)');
    }
    return colors.get(id);
  }

  for (const id of latestTop(history, 'both')) color(id);
  for (const topic of sorted) color(topic.id);
  for (const topic of sorted) {
    const label = element('label', '', choices);
    const box = element('input', '', label);
    box.type = 'checkbox';
    box.value = topic.id;
    const suffix = breaks.has(topic.code) ? ' · ruptura de serie' : notes[topic.code] ? ' · nota metodológica' : '';
    element('span', topic.label + suffix, label);
    label.dataset.search = searchable(topic.label + ' ' + topic.code);
    box.addEventListener('change', () => {
      custom ??= new Set(selected);
      if (box.checked) custom.add(topic.id);
      else custom.delete(topic.id);
      update();
    });
  }

  function filter() {
    const query = searchable(search.value.trim());
    let count = 0;
    for (const label of choices.children) {
      label.hidden = !label.dataset.search.includes(query);
      if (!label.hidden) count++;
    }
    get('results').textContent = count ? count + ' preocupaciones encontradas' : 'No hay coincidencias.';
  }

  function showStudy(index) {
    const study = timeline[index];
    const date = dateFormat.format(study.time);
    cursor.value = index;
    cursor.setAttribute('aria-valuetext', date + ', CIS ' + study.id);
    if (marker) {
      marker.setAttribute('x1', xFor(study.time));
      marker.setAttribute('x2', xFor(study.time));
    }
    detail.replaceChildren();
    element('strong', date + ' · Fuente: CIS, estudio ' + study.id, detail);
    const list = element('ul', '', detail);
    for (const id of selected) {
      const topic = series.get(id);
      for (const perspective of linePerspectives) {
        const row = topic.points[perspective].get(study.id);
        const value = row ? numberFormat.format(row.porcentaje) + ' %' : 'Sin dato';
        element('li', (row?.etiqueta ?? topic.label) + ' · ' + perspectives[perspective] + ' · ' + value, list);
      }
    }
  }

  function draw() {
    chart.replaceChildren();
    const width = Math.max(300, chart.clientWidth || 360);
    chartWidth = width;
    const height = width < 520 ? 250 : 320;
    const left = 42;
    const right = width - 14;
    const bottom = height - 32;
    const top = 15;
    const start = Date.parse('2023-07-23');
    const end = timeline.at(-1).time;
    xFor = time => left + (time - start) / (end - start) * (right - left);
    chart.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    chart.setAttribute('height', height);
    const lines = selected.flatMap(id => linePerspectives.map(perspective => ({
      id, perspective, runs: segments(timeline, series.get(id).points[perspective]),
    })));
    const values = lines.flatMap(line => line.runs.flatMap(run => run.map(point => point.value)));
    const maximum = Math.max(10, Math.ceil(Math.max(0, ...values) / 10) * 10);
    const y = value => bottom - value / maximum * (bottom - top);
    for (let tick = 0; tick <= 4; tick++) {
      const value = maximum * tick / 4;
      svgElement(chart, 'line', { x1: left, x2: right, y1: y(value), y2: y(value), stroke: '#c6d1cc' });
      svgElement(chart, 'text', { x: left - 5, y: y(value) + 4, 'text-anchor': 'end' }, numberFormat.format(value) + ' %');
    }
    for (const year of [2023, 2024, 2025, 2026]) {
      const time = year === 2023 ? start : Date.UTC(year, 0, 1);
      if (time <= end) svgElement(chart, 'text', { x: xFor(time), y: height - 10 }, String(year));
    }
    marker = svgElement(chart, 'line', { y1: top, y2: bottom, stroke: '#52605b', 'stroke-dasharray': '2 4' });
    for (const { id, perspective, runs } of lines) {
      for (const run of runs) {
        if (run.length === 1) {
          svgElement(chart, 'circle', { cx: xFor(run[0].time), cy: y(run[0].value), r: 3,
            fill: perspective === 'Personal' ? '#fff' : color(id), stroke: color(id), 'stroke-width': 2 });
          continue;
        }
        svgElement(chart, 'polyline', { points: run.map(p => xFor(p.time) + ',' + y(p.value)).join(' '),
          fill: 'none', stroke: color(id), 'stroke-width': 2.5, 'stroke-linejoin': 'round',
          'stroke-dasharray': perspective === 'Personal' ? '6 4' : 'none' });
      }
    }
    showStudy(Number(cursor.value));
  }

  function update() {
    selected = custom ? [...custom] : latestTop(history, mode.value);
    linePerspectives = mode.value === 'both' ? ['Espana', 'Personal'] : [mode.value];
    for (const label of choices.children) label.firstChild.checked = selected.includes(label.firstChild.value);
    status.textContent = custom
      ? selected.length + ' preocupaciones seleccionadas. Selecciona alguna para ver su evolución.'
      : mode.value === 'both' ? 'Cinco primeras de cada perspectiva en el último CIS.'
        : 'Cinco primeras en el último CIS · ' + perspectives[mode.value] + '.';
    legend.replaceChildren();
    warnings.replaceChildren();
    for (const id of selected) {
      const topic = series.get(id);
      const item = element('li', topic.label, legend);
      item.style.setProperty('--history-color', color(id));
      if (notes[topic.code]) element('li', notes[topic.code] + ' Interpretar la comparación con cautela.', warnings);
    }
    draw();
  }

  chart.addEventListener('pointermove', event => {
    const rect = chart.getBoundingClientRect();
    const x = (event.clientX - rect.left) * chartWidth / rect.width;
    const index = timeline.reduce((nearest, study, i) =>
      Math.abs(xFor(study.time) - x) < Math.abs(xFor(timeline[nearest].time) - x) ? i : nearest, 0);
    if (index !== Number(cursor.value)) showStudy(index);
  });
  cursor.addEventListener('input', () => showStudy(Number(cursor.value)));
  mode.addEventListener('change', update);
  search.addEventListener('input', filter);
  get('reset').addEventListener('click', () => { custom = null; update(); });
  new ResizeObserver(() => {
    if (chart.clientWidth >= 300 && chart.clientWidth !== chartWidth) draw();
  }).observe(chart);
  filter();
  update();
}

const root = globalThis.document?.querySelector('#cis-history');
if (root) {
  fetch(new URL('../analisis-cis/datos-procesados/evolucion-preocupaciones.json', import.meta.url))
    .then(response => {
      if (!response.ok) throw new Error('Datos no disponibles');
      return response.json();
    })
    .then(rows => {
      const history = prepareHistory(rows);
      if (!history.timeline.length) throw new Error('Histórico vacío');
      root.querySelector('[data-history="content"]').hidden = false;
      mount(root, history);
      root.querySelector('[data-history="loading"]').hidden = true;
    })
    .catch(() => {
      root.querySelector('[data-history="content"]').hidden = true;
      root.querySelector('[data-history="loading"]').textContent = 'No se pudo cargar el histórico del CIS. Recarga la página para reintentar.';
    });
}
