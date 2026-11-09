(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const status = byId('social-status');
  const overview = byId('social-overview');
  const group = byId('social-group');
  const category = byId('social-category');
  const choice = byId('social-choice');
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

  const themes = {
    Situacion_laboral: ['Trabajo', 'Edad', '¿Cómo cambia la situación laboral según la edad?'],
    Edad: ['Edad', 'Situacion_laboral', '¿Qué edades tienen las personas en cada situación laboral?'],
    Estudios: ['Estudios', 'Edad', '¿Cómo cambia el nivel de estudios según la edad?'],
    Ideologia: ['Ideología', 'Edad', '¿Cómo se sitúan en la escala ideológica los distintos grupos de edad?'],
    Ingresos: ['Ingresos', 'Estudios', '¿Cómo varían los ingresos del hogar según el nivel de estudios?'],
    Sexo: ['Sexo', 'Situacion_laboral', '¿Cómo se distribuyen hombres y mujeres en cada situación laboral?'],
    Municipio: ['Municipio', 'Ingresos', '¿En qué tamaño de municipio vive cada grupo de ingresos?'],
    Clase_social: ['Clase social', 'Ingresos', '¿Cómo se identifica cada grupo de ingresos en términos de clase social?']
  };

  function estimate(row) {
    if (row.nivel_informacion === 'Grupo muy pequeno') return [null, 'Base del grupo muy pequeña'];
    if (row.nivel_informacion === 'Celda muy pequena') return [null, 'Menos de 10 casos'];
    if (row.nivel_informacion === 'Interpretar con cautela') return [row.porcentaje, 'Interpretar con cautela'];
    return [row.porcentaje, row.n_celda === 0 ? 'Sin casos observados' : ''];
  }

  function distribution(dimension, rows, crossed) {
    const list = element('ul', '', 'social-list');
    const byCategory = new Map(rows.map(row => [row.categoria, row]));
    for (const key of dimensions[dimension][1]) {
      const row = byCategory.get(key);
      const item = element('li');
      item.append(element('strong', label(dimension, key)));
      if (!row) {
        item.append(element('div', 'Dato no disponible', 'social-meta'));
      } else if (crossed) {
        const [value, note] = estimate(row);
        item.append(element('span', (value === null ? 'Estimación oculta' : pct(value))
          + ' · Referencia ' + pct(row.referencia_general) + (note ? ' · ' + note : ''), 'social-cell'));
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
    group.value = 'Edad';
    category.value = 'Situacion_laboral';
    byId('social-source').textContent = 'CIS ' + data.metadata.estudio + ' · ' + count(data.metadata.entrevistas)
      + ' entrevistas. Porcentajes ponderados con ' + data.metadata.ponderacion + '.';

    function showOverview() {
      const rows = general.get(overview.value);
      const { n_validos, n_excluidos } = rows[0];
      byId('social-overview-base').textContent = 'Entre quienes tienen un dato válido en esta dimensión · '
        + count(n_validos) + ' entrevistas válidas · ' + count(n_excluidos) + ' excluidas.';
      byId('social-distribution').replaceChildren(distribution(overview.value, rows, false));
    }

    const topics = new Map();
    function shortcut(container, text, c, g) {
      const button = element('button', text, 'social-shortcut');
      button.type = 'button';
      button.addEventListener('click', () => {
        group.value = g;
        category.value = c;
        showCross();
      });
      byId(container).append(button);
      return button;
    }

    for (const [c, [name, g]] of Object.entries(themes)) {
      topics.set(c, shortcut('social-topics', name, c, g));
    }
    shortcut('social-suggestions', 'Trabajo por edad', 'Situacion_laboral', 'Edad');
    shortcut('social-suggestions', 'Ingresos por estudios', 'Ingresos', 'Estudios');
    shortcut('social-suggestions', 'Estudios por sexo', 'Estudios', 'Sexo');

    function showComparison() {
      const rows = crosses.get(group.value + '/' + category.value);
      const selected = rows.filter(row => row.categoria === choice.value);
      const byGroup = new Map(selected.map(row => [row.grupo, row]));
      byId('social-comparison').replaceChildren(...dimensions[group.value][1].map(key => {
        const row = byGroup.get(key);
        const item = element('li');
        const heading = element('div', '', 'social-row-heading');
        heading.append(element('strong', label(group.value, key)));
        item.append(heading);
        if (!row) {
          item.append(element('span', 'Dato no disponible', 'social-meta'));
          return item;
        }
        const [value, note] = estimate(row);
        heading.append(element('span', 'Base ' + count(row.n_grupo), 'social-meta'));
        item.append(bar(value, value === null ? 'Estimación oculta' : pct(value)));
        if (note) item.append(element('div', note, 'social-meta'));
        return item;
      }));
      byId('social-reference').textContent = dimensions[category.value][0] + ' por '
        + dimensions[group.value][0].toLocaleLowerCase('es') + ' · ' + label(category.value, choice.value)
        + ' · Referencia del conjunto: ' + pct(selected[0].referencia_general);
    }

    choice.addEventListener('change', showComparison);

    function showCross() {
      for (const option of group.options) option.disabled = option.value === category.value;
      for (const option of category.options) option.disabled = option.value === group.value;
      const rows = crosses.get(group.value + '/' + category.value);
      const { n_validos_cruce, n_excluidos } = rows[0];
      const c = category.value;
      const g = group.value;
      for (const [key, button] of topics) button.setAttribute('aria-pressed', String(key === c));
      const [, defaultGroup, question] = themes[c];
      byId('social-question').textContent = g === defaultGroup ? question
        : '¿Cómo se distribuye «' + dimensions[c][0] + '» en cada grupo de «' + dimensions[g][0] + '»?';
      const previous = choice.dataset.dimension === c ? choice.value : '';
      choice.replaceChildren(...dimensions[c][1].map(value => new Option(label(c, value), value)));
      if (previous) choice.value = previous;
      choice.dataset.dimension = c;
      byId('social-universe').textContent = 'Fuente CIS ' + data.metadata.estudio + ' · '
        + count(n_validos_cruce) + ' entrevistas válidas · ' + count(n_excluidos)
        + ' excluidas · Porcentaje ponderado dentro de cada grupo';
      showComparison();
      const byGroup = Map.groupBy(rows, row => row.grupo);
      const cards = dimensions[group.value][1].map(value => {
        const cells = byGroup.get(value) ?? [];
        const card = element('section', '', 'social-card');
        const title = element('h6', label(group.value, value));
        card.append(title);
        if (cells.length) {
          const { n_grupo, n_efectivo, peso_grupo } = cells[0];
          card.append(element('p', 'Base ' + count(n_grupo) + ' · Base efectiva ' + count(n_efectivo)
            + ' · Suma de PESO ' + weightedBase.format(peso_grupo), 'social-meta'));
        } else {
          card.append(element('p', 'Grupo sin datos disponibles', 'social-meta'));
        }
        card.append(distribution(category.value, cells, true));
        return card;
      });
      byId('social-results').replaceChildren(...cards);
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
