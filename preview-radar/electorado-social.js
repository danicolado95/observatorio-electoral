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
  const count = value => number.format(value);

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function bar(value, text, reference = false) {
    const line = element('div', '', 'social-bar');
    const track = element('div', '', 'social-track');
    track.setAttribute('aria-hidden', 'true');
    if (value !== null) {
      const fill = element('span', '', reference ? 'social-ref' : '');
      fill.style.width = value + '%';
      track.append(fill);
    }
    line.append(track, element('span', text));
    return line;
  }

  function distribution(dimension, rows, crossed) {
    const list = element('ul', '', 'social-list');
    const byCategory = new Map(rows.map(row => [row.categoria, row]));
    for (const value of dimensions[dimension][1]) {
      const row = byCategory.get(value);
      const item = element('li');
      item.append(element('strong', label(dimension, value)));
      if (!row) {
        item.append(element('div', 'Dato no disponible', 'social-meta'));
      } else {
        const smallGroup = crossed && row.nivel_informacion === 'Grupo muy pequeno';
        const smallCell = crossed && row.nivel_informacion === 'Celda muy pequena';
        const hidden = smallGroup || smallCell;
        const observedZero = crossed && row.n_celda === 0;
        const note = smallGroup ? 'Base del grupo muy pequeña'
          : smallCell ? 'Menos de 10 casos'
          : row.nivel_informacion === 'Interpretar con cautela' ? 'Interpretar con cautela' : '';
        const result = hidden ? 'Estimación oculta' : pct(row.porcentaje);
        item.append(bar(hidden ? null : row.porcentaje, crossed ? 'Grupo · ' + result : result));
        if (crossed) {
          item.append(bar(row.referencia_general, 'Referencia · ' + pct(row.referencia_general), true));
        }
        if (observedZero || note) {
          item.append(element('div', [observedZero ? 'Sin casos observados' : '', note].filter(Boolean).join(' · '), 'social-meta'));
        }
        if (!crossed && row.n < 30) {
          item.append(element('div', 'Interpretar con cautela · ' + count(row.n) + ' casos', 'social-meta'));
        }
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

    function showCross() {
      for (const option of group.options) option.disabled = option.value === category.value;
      for (const option of category.options) option.disabled = option.value === group.value;
      const rows = crosses.get(group.value + '/' + category.value);
      const { n_validos_cruce, n_excluidos } = rows[0];
      byId('social-universe').textContent = dimensions[category.value][0] + ' por ' + dimensions[group.value][0].toLocaleLowerCase('es')
        + '. Cada porcentaje se calcula entre quienes pertenecen al grupo indicado y tienen un dato válido en ambas dimensiones. '
        + count(n_validos_cruce) + ' entrevistas válidas · ' + count(n_excluidos) + ' excluidas.';
      const byGroup = Map.groupBy(rows, row => row.grupo);
      const cards = dimensions[group.value][1].map(value => {
        const cells = byGroup.get(value) ?? [];
        const card = element('section', '', 'social-card');
        const title = element('h5', label(group.value, value));
        card.append(title);
        if (cells.length) {
          const { n_grupo, n_efectivo } = cells[0];
          card.append(element('p', 'Base ' + count(n_grupo) + ' · Base efectiva ' + count(n_efectivo), 'social-meta'));
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
