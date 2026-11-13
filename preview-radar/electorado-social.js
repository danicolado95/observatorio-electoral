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
  const pct = value => number.format(value) + ' %';
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

    const ideologyColors = ['#721c31', '#9e3247', '#c25261', '#dc8189', '#747979',
      '#81afd2', '#5f96c3', '#4279ac', '#285984', '#15395f'];
    const mode = byId('social-mode');
    const order = byId('social-order');
    const selections = new Map(options.map(([key]) => [key, new Set()]));
    const visibleGroups = new Map(options.map(([key, [, values]]) => [key, new Set(values)]));

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
      const selected = selections.get(c);
      const visible = visibleGroups.get(g);
      const palette = c === 'Ideologia' ? ideologyColors : colors;
      byId('social-palette').textContent = c === 'Ideologia'
        ? 'Escala ideológica: rojo (1–4), gris (5) y azul (6–10). Los tonos se oscurecen hacia los extremos.'
        : '';

      legend.replaceChildren(...keys.map((key, index) => {
        const button = element('button', label(c, key));
        button.type = 'button';
        button.dataset.category = key;
        button.style.setProperty('--category-color', palette[index]);
        button.setAttribute('aria-pressed', String(selected.has(key)));
        button.onclick = () => {
          if (selected.has(key)) selected.delete(key);
          else selected.add(key);
          button.setAttribute('aria-pressed', String(selected.has(key)));
          render();
        };
        return button;
      }));

      const filters = byId('social-filters');
      const reset = element('button', 'Ver todos', 'btn light');
      reset.type = 'button';
      const groupButtons = dimensions[g][1].map(key => {
        const button = element('button', label(g, key), 'btn light');
        button.type = 'button';
        button.setAttribute('aria-pressed', String(visible.has(key)));
        button.onclick = () => {
          if (visible.has(key)) visible.delete(key);
          else visible.add(key);
          button.setAttribute('aria-pressed', String(visible.has(key)));
          render();
        };
        return button;
      });
      reset.onclick = () => {
        dimensions[g][1].forEach(key => visible.add(key));
        groupButtons.forEach(button => button.setAttribute('aria-pressed', 'true'));
        render();
      };
      filters.replaceChildren(reset, ...groupButtons);

      const byGroup = Map.groupBy(rows, row => row.grupo);
      const groups = dimensions[g][1].map(key => {
        const lookup = new Map((byGroup.get(key) ?? []).map(row => [row.categoria, row]));
        const cells = keys.map(categoryKey => lookup.get(categoryKey));
        return { key, cells, complete: cells.every(row => Number.isFinite(row?.porcentaje)) };
      });

      function render() {
        const hasSelection = selected.size > 0;
        const split = hasSelection && mode.value === 'split';
        mode.options[1].disabled = !hasSelection;
        order.disabled = !hasSelection;
        const shown = groups.filter(({ key }) => visible.has(key)).map(entry => {
          if (!entry.complete || !hasSelection) return entry;
          const weights = [0, 0];
          for (const row of entry.cells) weights[selected.has(row.categoria) ? 0 : 1] += row.peso_celda;
          return { ...entry, totals: weights.map(weight => 100 * weight / entry.cells[0].peso_grupo) };
        });
        if (hasSelection && order.value !== 'natural') {
          shown.sort((a, b) => {
            if (!a.totals || !b.totals) return Number(!a.totals) - Number(!b.totals);
            return (a.totals[0] - b.totals[0]) * (order.value === 'asc' ? 1 : -1);
          });
        }
        byId('social-selection').textContent = selected.size + ' categorías seleccionadas · '
          + shown.length + ' de ' + groups.length + ' grupos visibles.';
        results.replaceChildren(...shown.map(({ key, cells, complete, totals }) => {
          const name = label(g, key);
          const card = element('section', '', 'social-card');
          card.dataset.group = key;
          card.append(element('h6', name));
          if (split && !complete) {
            card.append(element('small', 'Selección y resto no disponibles', 'social-meta'));
          }
          const detail = element('div', '', 'social-detail');
          detail.hidden = true;
          const stack = element('div', '', 'social-stack');
          stack.setAttribute('role', 'group');
          stack.setAttribute('aria-label', name + (complete ? '' : ' · Estimaciones parciales'));
          const segments = split && complete
            ? totals.map((value, i) => [i === 0 ? 'Selección' : 'Resto', value, ['#245578', '#56605c'][i], pct(value), false, i === 0 ? 'selected' : 'rest'])
            : cells.flatMap((row, i) => {
              if (!Number.isFinite(row?.porcentaje)) return [];
              const key = keys[i];
              return [[label(c, key), row.porcentaje, palette[i], pct(row.porcentaje),
                hasSelection && !selected.has(key), key]];
            });
          segments.forEach(([segmentName, value, color, display, muted, segmentKey]) => {
            const button = element('button', '', value === 0 ? 'social-zero' : '');
            button.type = 'button';
            button.dataset.category = segmentKey;
            button.style.width = value + '%';
            button.style.backgroundColor = color;
            button.classList.toggle('social-muted', muted);
            if (split && complete) button.append(element('span', display, 'social-segment-value'));
            const info = segmentName + ' · ' + display;
            button.setAttribute('aria-label', info);
            const show = () => {
              detail.textContent = info;
              detail.hidden = false;
              const center = button.offsetLeft + button.offsetWidth / 2;
              const maxLeft = chart.clientWidth - detail.offsetWidth;
              detail.style.left = Math.max(0, Math.min(maxLeft, center - detail.offsetWidth / 2)) + 'px';
            };
            const hide = () => { detail.hidden = true; };
            button.onfocus = button.onpointerenter = button.onclick = show;
            button.onblur = hide;
            button.onpointerleave = () => {
              if (document.activeElement !== button) hide();
            };
            button.onkeydown = event => {
              if (event.key === 'Escape') hide();
            };
            stack.append(button);
          });
          const chart = element('div', '', 'social-chart');
          chart.append(stack, detail);
          card.append(chart);
          return card;
        }));
        if (!shown.length) results.append(element('p', 'Usa «Ver todos» para restaurar los grupos.'));
      }

      mode.onchange = order.onchange = render;
      render();
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
