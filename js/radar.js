
console.log('Radar Demoscópico de Atlas Electoral conectado');

const resultados23J = {
  fecha: '2023-07-23',
  partidos: {
    PP: 33.1,
    PSOE: 31.7,
    VOX: 12.4,
    SUMAR: 12.3
  }
};

const coloresRadar = {
  PP: '#347cbd',
  PSOE: '#e54440',
  VOX: '#69a554',
  SUMAR: '#d36a9d'
};

function dibujarRadarInicial() {
  const contenedor = document.getElementById('radar-grafico');
  if (!contenedor) return;

  const ns = 'http://www.w3.org/2000/svg';
  const crear = (tipo, atributos = {}, texto = '') => {
    const elemento = document.createElementNS(ns, tipo);
    Object.entries(atributos).forEach(([k, v]) =>
      elemento.setAttribute(k, String(v))
    );
    if (texto) elemento.textContent = texto;
    return elemento;
  };

  const ancho = 800;
  const alto = 360;
  const izquierda = 55;
  const derecha = 770;
  const arriba = 25;
  const abajo = 305;

  const svg = crear('svg', {
    viewBox: `0 0 ${ancho} ${alto}`,
    width: '100%',
    role: 'img',
    'aria-label': 'Resultados electorales del 23J'
  });

  // Eje vertical y líneas horizontales
  for (let porcentaje = 0; porcentaje <= 40; porcentaje += 10) {
    const y = abajo - (porcentaje / 40) * (abajo - arriba);

    svg.appendChild(crear('line', {
      x1: izquierda,
      y1: y,
      x2: derecha,
      y2: y,
      stroke: '#dce5df'
    }));

    svg.appendChild(crear('text', {
      x: izquierda - 12,
      y: y + 4,
      'text-anchor': 'end',
      fill: '#70857c',
      'font-size': 13
    }, `${porcentaje}%`));
  }

  // Marca de las elecciones del 23J
  const x23J = 95;

  svg.appendChild(crear('line', {
    x1: x23J,
    y1: arriba,
    x2: x23J,
    y2: abajo,
    stroke: '#82998f',
    'stroke-dasharray': '5 5'
  }));

  svg.appendChild(crear('text', {
    x: x23J,
    y: abajo + 25,
    'text-anchor': 'middle',
    fill: '#29463f',
    'font-size': 13
  }, '23J · 2023'));

  // Fechas del eje horizontal
  const inicio = new Date('2023-07-23T12:00:00');
  const fin = new Date('2026-10-25T12:00:00');

  const posicionFecha = (fecha) => {
    const momento = new Date(`${fecha}T12:00:00`);
    return x23J +
      ((momento - inicio) / (fin - inicio)) * (derecha - x23J);
  };

  const marcasTiempo = [
    ['2024-01-01', '2024'],
    ['2025-01-01', '2025'],
    ['2026-01-01', '2026'],
    ['2026-10-25', 'Hoy']
  ];

  marcasTiempo.forEach(([fecha, etiqueta]) => {
    const x = posicionFecha(fecha);

    svg.appendChild(crear('line', {
      x1: x,
      y1: abajo,
      x2: x,
      y2: abajo + 6,
      stroke: '#82998f'
    }));

    svg.appendChild(crear('text', {
      x: x,
      y: abajo + 25,
      'text-anchor': 'middle',
      fill: '#70857c',
      'font-size': 13
    }, etiqueta));
  });

  // Resultados oficiales como puntos
  Object.entries(resultados23J.partidos).forEach(([partido, valor]) => {
    const y = abajo - (valor / 40) * (abajo - arriba);

    const punto = crear('circle', {
      cx: x23J,
      cy: y,
      r: 6,
      fill: coloresRadar[partido],
      stroke: '#ffffff',
      'stroke-width': 2
    });

    punto.appendChild(crear(
      'title',
      {},
      `${partido}: ${valor.toLocaleString('es-ES')} % · 23J`
    ));

    svg.appendChild(punto);
  });

  // Leyenda independiente
  const leyenda = document.createElement('div');
  leyenda.style.display = 'flex';
  leyenda.style.flexWrap = 'wrap';
  leyenda.style.gap = '18px';
  leyenda.style.marginTop = '10px';

  Object.entries(coloresRadar).forEach(([partido, color]) => {
    const elemento = document.createElement('span');
    elemento.style.display = 'inline-flex';
    elemento.style.alignItems = 'center';
    elemento.style.gap = '7px';

    const muestra = document.createElement('span');
    muestra.style.width = '10px';
    muestra.style.height = '10px';
    muestra.style.borderRadius = '50%';
    muestra.style.background = color;

    elemento.append(muestra, partido);
    leyenda.appendChild(elemento);
  });

  contenedor.replaceChildren(svg, leyenda);
}

dibujarRadarInicial();

