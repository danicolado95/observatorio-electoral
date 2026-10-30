import { readFile, writeFile, rename, unlink, open } from 'node:fs/promises';
import { procesarBarometro } from './cis-historico.mjs';
import { fusionar } from './fusionar-cis.mjs';

const PIPELINE_TEST = process.argv.includes('--pipeline-test');
const MODO_TEST = process.argv.includes('--test') || PIPELINE_TEST;

if (PIPELINE_TEST && process.argv.includes('--test')) {
  throw new Error('Utiliza solamente uno de los dos modos de prueba');
}

const RUTA = PIPELINE_TEST
  ? 'data/pipeline-test/data/cis-historico.json'
  : MODO_TEST
    ? 'data/cis-actualizacion-test.json'
    : 'data/cis-historico.json';

if (MODO_TEST) {
  console.log('MODO TEST: histórico de producción protegido.');
}

const RUTA_BLOQUEO = `${RUTA}.lock`;

let bloqueoProceso = null;

if (process.argv.includes('--guardar')) {
  bloqueoProceso = await open(RUTA_BLOQUEO, 'wx');

  console.log('Bloqueo de actualización adquirido.');
}  
try {
const historico = JSON.parse(
  await readFile(RUTA, 'utf8')
).encuestas;

const conocidos = new Set(
  historico.map(e => String(e.estudio_id))
);

const meses = [
  'enero', 'febrero', 'marzo', 'abril',
  'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'
];

const hoy = new Date();
const nuevas = [];

console.log('Estudios históricos:', historico.length);

for (let desplazamiento = 0; desplazamiento < 6; desplazamiento++) {
  const fecha = new Date(Date.UTC(
    hoy.getUTCFullYear(),
    hoy.getUTCMonth() - desplazamiento,
    1
  ));

  if (fecha.getUTCMonth() === 7) continue;

  const mes = meses[fecha.getUTCMonth()];
  const anio = fecha.getUTCFullYear();
  const url = `https://www.cis.es/es/estudios/barometro-de-${mes}-${anio}`;

  const respuesta = await fetch(url, {
    signal: AbortSignal.timeout(30000)
  });

  if (respuesta.url.includes('__cis_antibot') ||
      respuesta.status === 403 ||
      respuesta.status === 429) {
    throw new Error('Acceso limitado por el CIS. Actualización detenida.');
  }

  if (respuesta.status === 404) {
    console.log('Sin estudio:', mes, anio);
    continue;
  }

  if (!respuesta.ok) {
    throw new Error(`HTTP ${respuesta.status}: ${url}`);
  }

  const html = await respuesta.text();

  const ids = [...new Set(
    [...html.matchAll(/Estudio\s+(?:CIS\s+)?(?:n[º°]\s*)?(\d{4})/gi)]
      .map(m => m[1])
  )];

  if (ids.length !== 1) {
    throw new Error(
      `Identificador ambiguo en ${mes} ${anio}: ${ids.join(', ')}`
    );
  }

  const id = ids[0];

  if (conocidos.has(id)) {
    console.log('Ya registrado:', id, mes, anio);
  } else {
    console.log('NUEVO:', id, mes, anio);

    const encuesta = await procesarBarometro(url);

    if (String(encuesta.estudio_id) !== id) {
      throw new Error(`Estudios diferentes: ${id} / ${encuesta.estudio_id}`);
    }

    nuevas.push(encuesta);
  }

  await new Promise(resolve => setTimeout(resolve, 1500));
}

const resultado = fusionar(historico, nuevas);
const ids = resultado.map(e => String(e.estudio_id));

if (resultado.length < historico.length) {
  throw new Error('Seguridad: se han perdido estudios históricos');
}

if (new Set(ids).size !== resultado.length) {
  throw new Error('Seguridad: hay estudios duplicados');
}

for (const encuesta of resultado) {
  if (
    !encuesta.estudio_id ||
    !encuesta.fuente ||
    !encuesta.trabajo_campo_inicio ||
    !encuesta.trabajo_campo_fin ||
    !encuesta.fecha_avance ||
    !encuesta.fecha_publicacion ||
    !Number.isInteger(encuesta.tamano_muestra) ||
    encuesta.tamano_muestra <= 0 ||
    !encuesta.resultados ||
    Object.keys(encuesta.resultados).length < 3
  ) {
    throw new Error(
      `Seguridad: registro incompleto ${encuesta.estudio_id}`
    );
  }

  if (
    encuesta.trabajo_campo_inicio > encuesta.trabajo_campo_fin ||
    encuesta.trabajo_campo_fin > encuesta.fecha_publicacion ||
    encuesta.fecha_avance > encuesta.fecha_publicacion
  ) {
    throw new Error(
      `Seguridad: fechas incoherentes ${encuesta.estudio_id}`
    );
  }
}

console.log('VALIDACIÓN DE SEGURIDAD: SUPERADA');

console.log('\nRESUMEN DE ACTUALIZACIÓN');
console.log('Histórico original:', historico.length);
console.log('Encuestas nuevas:', nuevas.length);
console.log('Total resultante:', resultado.length);
console.log('IDs únicos:', new Set(resultado.map(e => e.estudio_id)).size);
if (!process.argv.includes('--guardar')) {
  console.log('MODO PRUEBA: no se ha modificado ningún archivo.');
}

async function guardarHistoricoSeguro(encuestas) {
  const temporal = `${RUTA}.tmp`;

  const contenido = JSON.stringify({
    version: 1,
    encuestas
  }, null, 2) + '\n';

  try {
    await writeFile(temporal, contenido, {
      encoding: 'utf8',
      flag: 'wx'
    });

    await rename(temporal, RUTA);
  } catch (error) {
    await unlink(temporal).catch(() => {});
    throw error;
  }
}

// El guardado solo se permite cuando se indica expresamente.
if (process.argv.includes('--guardar')) {
  if (nuevas.length === 0 && !MODO_TEST) {
    console.log('Sin novedades: histórico sin modificar.');
  } else {
    await guardarHistoricoSeguro(resultado);

    console.log(
      MODO_TEST
        ? 'PRUEBA: copia guardada correctamente.'
        : 'Histórico actualizado correctamente.'
    );
  }
}} finally {
  if (bloqueoProceso) {
    await bloqueoProceso.close();
    await unlink(RUTA_BLOQUEO);
    console.log('Bloqueo de actualización liberado.');
  }
}