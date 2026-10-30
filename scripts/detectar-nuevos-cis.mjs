import { procesarBarometro } from './cis-historico.mjs';

import { readFile } from 'node:fs/promises';

const archivo = JSON.parse(
  await readFile('data/cis-historico.json', 'utf8')
);

const conocidos = new Set(
  archivo.encuestas.map(e => String(e.estudio_id))
);

const meses = [
  'enero', 'febrero', 'marzo', 'abril',
  'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'
];

const hoy = new Date();
const candidatos = [];

for (let desplazamiento = 0; desplazamiento < 3; desplazamiento++) {
  const fecha = new Date(Date.UTC(
    hoy.getUTCFullYear(),
    hoy.getUTCMonth() - desplazamiento,
    1
  ));

  if (fecha.getUTCMonth() === 7) continue; // Agosto

  candidatos.push(
    `https://www.cis.es/es/estudios/barometro-de-${meses[fecha.getUTCMonth()]}-${fecha.getUTCFullYear()}`
  );
}

console.log('Estudios conocidos:', conocidos.size);

for (const url of candidatos) {
  const respuesta = await fetch(url, {
    signal: AbortSignal.timeout(30000)
  });

  if (respuesta.url.includes('__cis_antibot') ||
      respuesta.status === 403 ||
      respuesta.status === 429) {
    throw new Error('Acceso limitado por el CIS. Comprobación detenida.');
  }

  if (respuesta.status === 404) {
    console.log('Todavía no publicado:', url);
    continue;
  }

  if (!respuesta.ok) {
    throw new Error(`HTTP ${respuesta.status}: ${url}`);
  }

  const html = await respuesta.text();

  const titulo = html.match(
    /<title[^>]*>([\s\S]*?)<\/title>/i
  )?.[1] || '';

  if (!/Barómetro de/i.test(titulo)) {
    throw new Error(`Página inesperada: ${url}`);
  }

  const id = html.match(
    /Estudio\s+(?:CIS\s+)?(?:n[º°]\s*)?(\d{4})/i
  )?.[1];

  if (!id) {
    console.log('Estudio sin identificar:', url);
    continue;
  }
  const idsEnPagina = [
  ...html.matchAll(/Estudio\s+(?:CIS\s+)?(?:n[º°]\s*)?(\d{4})/gi)
].map(m => m[1]);

console.log('Identificadores encontrados:', [...new Set(idsEnPagina)]);

  if (conocidos.has(id)) {
  console.log('Ya registrado:', id, url);
} else {
  console.log('NUEVO ESTUDIO DETECTADO:', id);

  const encuesta = await procesarBarometro(url);

  if (String(encuesta.estudio_id) !== id) {
    throw new Error(
      `Identificadores diferentes: página ${id}, PDF ${encuesta.estudio_id}`
    );
  }

  console.log('ESTUDIO NUEVO EXTRAÍDO:');
  console.log(JSON.stringify(encuesta, null, 2));
}

  await new Promise(resolve => setTimeout(resolve, 1500));
}
