(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const status = byId('social-status');
  const overview = byId('social-overview');
  const group = byId('social-group');
  const category = byId('social-category');
  const invert = byId('social-invert');

  const dimensions = {
    Edad: ['Edad', ['18-24', '25-34', '35-44', '45-54', '55-64', '65+']],
    Sexo: ['Sexo', ['Hombre', 'Mujer']],
    Estudios: ['Estudios', ['Sin estudios', 'Primaria', 'Secundaria 1', 'Secundaria 2', 'FP', 'Superiores', 'Otros']],
    Ideologia: ['Ideología', ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']],
    Ingresos: ['Ingresos netos del hogar', ['Menos de 1100', '1100-1800', '1801-2700', '2701-3900', '3901-5000', 'Mas de 5000']],
    Situacion_laboral: ['Situación laboral', ['Trabaja', 'Jubilado/a o pensionista', 'En desempleo', 'Estudiante', 'Trabajo domestico no remunerado', 'Otra situacion']],
    Municipio: ['Tamaño del municipio', ['Hasta 2.000', '2.001-10.000', '10.001-50.000', '50.001-100.000', '100.001-400.000', '400.001-1.000.000', 'Mas de 1.000.000']],
    Clase_social: ['Clase social subjetiva', ['Alta y media-alta', 'Media-media', 'Media-baja', 'Trabajadora', 'Baja o pobre', 'Otras']]
  };
  const labels = {
    'Secundaria 1': 'Secundaria, 1.ª etapa',
    'Secundaria 2': 'Secundaria, 2.ª etapa',
    'Mas de 1.000.000': 'Más de 1.000.000',
    'Trabajo domestico no remunerado': 'Trabajo doméstico no remunerado',
    'Otra situacion': 'Otra situación',
    '1': '1 · Izquierda',
    '10': '10 · Derecha'
  };
  const incomeLabels = ['Menos de 1.100 €', '1.100–1.800 €', '1.801–2.700 €', '2.701–3.900 €', '3.901–5.000 €', 'Más de 5.000 €'];
  const label = (dimension, value) => dimension === 'Ingresos'
    ? incomeLabels[dimensions.Ingresos[1].indexOf(value)]
    : labels[value] ?? value.replace(/-/g, '–');
  const number = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
  const pct = value => value > 0 && value < 0.05 ? '<0,1 %' : number.format(value) + ' %';
  const weightedBase = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 10 });
  const count = value => number.format(value);

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function bar(value, text) {
    const line = element('div', '', 'social-bar');
    const track = element('div', '', 'social-track');
    track.setAttribute('aria-hidden', 'true');
    if (value !== null) {
      const fill = element('span');
      fill.style.width = value + '%';
      track.append(fill);
    }
    line.append(track, element('span', text));
    return line;
  }

  const colors = ['#254b76', '#a33b4a', '#32745c', '#945c24', '#67488a',
    '#237786', '#713d23', '#556621', '#8f3d75', '#545967'];
  const groupNames = {
    Edad: 'la edad', Sexo: 'el sexo', Estudios: 'el nivel de estudios',
    Ideologia: 'la posición en la escala ideológica', Ingresos: 'los ingresos netos del hogar',
    Situacion_laboral: 'la situación laboral', Municipio: 'el tamaño del municipio',
    Clase_social: 'la clase social declarada'
  };

  function questionFor(c, g) {
    return '¿Cómo se distribuye ' + groupNames[c] + ' según ' + groupNames[g] + '?';
  }

  function estimate(row) {
    if (row.nivel_informacion === 'Grupo muy pequeno') return [null, 'Base del grupo muy pequeña'];
    if (row.nivel_informacion === 'Celda muy pequena') return [null, 'Menos de 10 casos'];
    if (row.nivel_informacion === 'Interpretar con cautela') return [row.porcentaje, 'Interpretar con cautela'];
    return [row.porcentaje, row.n_celda === 0 ? 'Sin casos observados' : ''];
  }

  function distribution(dimension, rows) {
    const list = element('ul', '', 'social-list');
    const byCategory = new Map(rows.map(row => [row.categoria, row]));
    for (const key of dimensions[dimension][1]) {
      const row = byCategory.get(key);
      const item = element('li');
      item.append(element('strong', label(dimension, key)));
      if (!row) {
        item.append(element('div', 'Dato no disponible', 'social-meta'));
      } else {
        item.append(bar(row.porcentaje, pct(row.porcentaje)));
        if (row.n < 30) item.append(element('div', 'Interpretar con cautela · ' + count(row.n) + ' casos', 'social-meta'));
      }
      list.append(item);
    }
    return list;
  }

  async function init() {
    const response = await fetch('../analisis-cis/resultados/electorado_social_3582.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    const general = Map.groupBy(data.distribuciones_generales, row => row.dimension);
    const crosses = Map.groupBy(data.cruces, row => row.dimension_grupo + '/' + row.dimension_categoria);
    const options = Object.entries(dimensions);
    for (const select of [overview, group, category]) {
      select.replaceChildren(...options.map(([key, [name]]) => new Option(name, key)));
    }
    for (const option of category.options) option.textContent = groupNames[option.value];
    for (const option of group.options) option.textContent = groupNames[option.value];
    group.value = 'Edad';
    category.value = 'Ideologia';
    byId('social-source').textContent = 'CIS ' + data.metadata.estudio + ' · ' + count(data.metadata.entrevistas)
      + ' entrevistas. Porcentajes ponderados con ' + data.metadata.ponderacion + '.';

    function showOverview() {
      const rows = general.get(overview.value);
      const { n_validos, n_excluidos } = rows[0];
      byId('social-overview-base').textContent = 'Entre quienes tienen un dato válido en esta dimensión · '
        + count(n_validos) + ' entrevistas válidas · ' + count(n_excluidos) + ' excluidas.';
      byId('social-distribution').replaceChildren(distribution(overview.value, rows));
    }

    const heading = byId('social-question');
    const legend = byId('social-legend');
    const results = byId('social-results');

    function showCross() {
      const c = category.value;
      const g = group.value;
      for (const option of group.options) option.disabled = option.value === c;
      for (const option of category.options) option.disabled = option.value === g;
      const rows = crosses.get(g + '/' + c);
      const { n_validos_cruce, n_excluidos } = rows[0];
      heading.textContent = questionFor(c, g);
      byId('social-universe').textContent = 'CIS ' + data.metadata.estudio + ' · '
        + count(n_validos_cruce) + ' entrevistas válidas · ' + count(n_excluidos)
        + ' excluidas · Porcentajes ponderados con ' + data.metadata.ponderacion + '.';

      const keys = dimensions[c][1];
      const buttons = keys.map((key, index) => {
        const button = element('button', label(c, key));
        button.type = 'button';
        button.style.setProperty('--category-color', colors[index]);
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => {
          const selected = button.getAttribute('aria-pressed') !== 'true';
          buttons.forEach((other, i) => other.setAttribute('aria-pressed', String(selected && i === index)));
          results.querySelectorAll('[data-category]').forEach(node => {
            node.classList.toggle('social-highlight', selected && node.dataset.category === key);
            node.classList.toggle('social-muted', selected && node.dataset.category !== key);
          });
        });
        return button;
      });
      legend.replaceChildren(...buttons);

      const byGroup = Map.groupBy(rows, row => row.grupo);
      results.replaceChildren(...dimensions[g][1].map(groupKey => {
        const cells = byGroup.get(groupKey) ?? [];
        const card = element('section', '', 'social-card');
        card.dataset.group = groupKey;
        card.append(element('h6', label(g, groupKey)));
        if (cells.length) {
          const { n_grupo, n_efectivo, peso_grupo } = cells[0];
          card.append(element('p', 'Base ' + count(n_grupo) + ' · Base efectiva ' + count(n_efectivo)
            + ' · Suma de PESO ' + weightedBase.format(peso_grupo), 'social-meta'));
        } else {
          card.append(element('p', 'Grupo sin datos disponibles', 'social-meta'));
        }
        const lookup = new Map(cells.map(row => [row.categoria, row]));
        const estimates = keys.map(key => lookup.has(key) ? estimate(lookup.get(key)) : [null, 'Dato no disponible']);
        const complete = estimates.every(([value]) => value !== null)
          && Math.abs(estimates.reduce((total, [value]) => total + value, 0) - 100) < 1e-8;
        const stack = element('div', '', 'social-stack');
        stack.setAttribute('aria-hidden', 'true');
        const list = element('ul', '', 'social-values');
        keys.forEach((key, index) => {
          const [value, note] = estimates[index];
          const item = element('li');
          item.dataset.category = key;
          item.style.setProperty('--category-color', colors[index]);
          item.append(element('strong', label(c, key)),
            element('span', value === null ? 'Estimación oculta' : pct(value), 'social-cell'));
          if (note) item.append(element('span', note, 'social-meta'));
          list.append(item);
          if (complete && value > 0) {
            const segment = element('span');
            segment.dataset.category = key;
            segment.style.backgroundColor = colors[index];
            segment.style.width = value + '%';
            stack.append(segment);
          }
        });
        if (complete) card.append(stack);
        card.append(list);
        return card;
      }));
    }

    overview.addEventListener('change', showOverview);
    group.addEventListener('change', showCross);
    category.addEventListener('change', showCross);
    invert.addEventListener('click', () => {
      [group.value, category.value] = [category.value, group.value];
      showCross();
    });
    showOverview();
    showCross();
    status.hidden = true;
    byId('social-content').hidden = false;
  }

  init().catch(error => {
    status.textContent = 'No se pudo cargar el perfil social. Recarga la página para volver a intentarlo.';
    console.error(error);
  });
})();
