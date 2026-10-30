
import { PDFParse } from 'pdf-parse';
import { writeFile } from 'node:fs/promises';

const URL_CIS = 'https://www.cis.es/es/avance-de-resultados';

const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4,
  mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, octubre: 10, noviembre: 11,
  diciembre: 12
};

function fechaISO(dia, mes, anio) {
  const fecha = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

  const comprobacion = new Date(`${fecha}T12:00:00Z`);

  if (
    Number.isNaN(comprobacion.getTime()) ||
    comprobacion.toISOString().slice(0, 10) !== fecha
  ) {
    throw new Error(`Fecha inválida: ${fecha}`);
  }

  return fecha;
}

async function descargarTextoPDF(url) {
  const respuesta = await fetch(url, {
    signal: AbortSignal.timeout(30000)
  });

  if (!respuesta.ok) {
    throw new Error(`HTTP ${respuesta.status}: ${url}`);
  }

  const bytes = Buffer.from(await respuesta.arrayBuffer());

  if (bytes.length > 5_000_000) {
    throw new Error('PDF demasiado grande');
  }

  if (bytes.subarray(0, 5).toString() !== '%PDF-') {
    throw new Error('El documento descargado no parece un PDF');
  }

  const parser = new PDFParse({ data: bytes });

  try {
    const resultado = await parser.getText();
    return resultado.text;
  } finally {
    await parser.destroy();
  }
}

function enlacesHTML(html, base) {
  return [...new Set(
    [...html.matchAll(/href=["']([^"']+)["']/gi)]
      .map(m => m[1].replaceAll('&amp;', '&'))
      .map(enlace => {
        try {
          const url = new URL(enlace, base);
          return url.hostname === 'www.cis.es' &&
            url.protocol === 'https:'
            ? url.href
            : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
  )];
}

function buscarFechaPagina(html, etiqueta) {
  const texto = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

  const posicion = texto.indexOf(etiqueta);

  if (posicion === -1) {
    throw new Error(`Falta ${etiqueta}`);
  }

  const fragmento = texto.slice(
    posicion + etiqueta.length,
    posicion + etiqueta.length + 100
  );

  const m = fragmento.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);

  if (!m) {
    throw new Error(`Fecha no reconocida: ${etiqueta}`);
  }

  return fechaISO(Number(m[1]), Number(m[2]), Number(m[3]));
}

function extraerFicha(texto) {
  const estudio = texto.match(
    /ESTUDIO\s+CIS\s+N[º°]\s*(\d+)/i
  )?.[1];

  const muestra = texto.match(
    /Realizada:\s*([\d.]+)\s+entrevistas/i
  )?.[1];

  const campo = texto.match(
    /Fecha de realización:\s*Del\s+(\d{1,2})\s+de\s+([a-záéíóú]+)\s+al\s+(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i
  ) || texto.match(
    /Fecha de realización:\s*Del\s+(\d{1,2})\s+al\s+(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i
  );

  if (!estudio || !muestra || !campo) {
    throw new Error(
      `Ficha incompleta: estudio=${estudio ?? 'NO'}, muestra=${muestra ?? 'NO'}, fechas=${campo ? 'SÍ' : 'NO'}`
    );
  }

  let diaInicio, diaFin, mesInicio, mesFin, anio;

  if (campo.length === 6) {
    [, diaInicio, mesInicio, diaFin, mesFin, anio] = campo;
  } else {
    [, diaInicio, diaFin, mesInicio, anio] = campo;
    mesFin = mesInicio;
  }

  const mes1 = MESES[mesInicio.toLowerCase()];
  const mes2 = MESES[mesFin.toLowerCase()];

  if (!mes1 || !mes2) {
    throw new Error('Mes no reconocido en ficha técnica');
  }

  const tamano_muestra = Number(muestra.replaceAll('.', ''));

  if (!Number.isInteger(tamano_muestra) || tamano_muestra <= 0) {
    throw new Error('Muestra inválida');
  }

  return {
    estudio,
    tamano_muestra,
    trabajo_campo_inicio: fechaISO(Number(diaInicio), mes1, Number(anio)),
    trabajo_campo_fin: fechaISO(Number(diaFin), mes2, Number(anio))
  };
}

function extraerEstimaciones(texto) {
  const estudio = texto.match(/Estudio nº\s*(\d+)/i)?.[1];

  if (!estudio) {
    throw new Error('No se encontró el número de estudio en la estimación');
  }

  const patrones = {
    PSOE: /^PSOE\s+/i,
    PP: /^PP\s+/i,
    VOX: /^VOX\s+/i,
    SUMAR: /^SUMAR(?:\s*\/\s*Frente Amplio)?\*{0,3}\s+/i,
    PODEMOS: /^Podemos\s+/i
  };

  const resultados = {};
  const filas = texto.split('\n').map(linea => linea.trim());

  for (const [partido, patron] of Object.entries(patrones)) {
    const candidatas = filas.filter(linea => {
  if (!patron.test(linea)) return false;

  // Solo aceptamos filas con el formato:
  // partido | voto directo | margen de error | estimación
  return /\d+(?:,\d+)?\s+±\s*\d+(?:,\d+)?\s+\d+(?:,\d+)?\s*$/.test(linea);
});

    if (candidatas.length === 0) {
  // El partido no figura por separado en este estudio.
  // No inventamos un porcentaje ni lo sustituimos por cero.
  continue;
}

if (candidatas.length > 1) {
  throw new Error(
    `${partido}: se encontraron ${candidatas.length} filas`
  );
}

    const fila = candidatas[0];

    // Solo la última columna: estimación, no voto directo.
    const numeros = fila.match(
      /(?:^|\s)(\d+(?:,\d+)?)\s+±\s*\d+(?:,\d+)?\s+(\d+(?:,\d+)?)\s*$/
    );

    if (!numeros) {
      throw new Error(`No se puede interpretar la fila de ${partido}`);
    }

    const valor = Number(numeros[2].replace(',', '.'));

    if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
      throw new Error(`Porcentaje inválido para ${partido}`);
    }

    resultados[partido] = valor;
  }

  if (Object.keys(resultados).length < 3) {
  throw new Error(
    'Estimación incompleta: menos de tres partidos identificados'
  );
}
  return { estudio, resultados };
}

export async function procesarBarometro(urlBarometro) {
  const respuesta = await fetch(urlBarometro, {
    signal: AbortSignal.timeout(30000)
  });

  if (!respuesta.ok) {
    throw new Error(`Error HTTP ${respuesta.status}`);
  }

  const html = await respuesta.text();

  const enlaces = enlacesHTML(html, urlBarometro);
  if (urlBarometro.includes('septiembre-2025')) {
  console.log('\nDOCUMENTOS DE SEPTIEMBRE 2025:');

  console.log(
    enlaces.filter(url =>
      /(?:FT\d+|\d+_Estimacion)\.pdf/i.test(url)
    )
  );
}

  const estimacion = enlaces.find(url =>
  /\/\d+_Estimacion\.pdf(?:\/|$)/i.test(url)
);

if (!estimacion) {
  throw new Error('No se encontró el PDF de estimación');
}

const estudioEsperado = estimacion.match(
  /\/(\d+)_Estimacion\.pdf(?:\/|$)/i
)?.[1];

let ficha = enlaces.find(url => {
  const numero = url.match(/\/FT(\d+)\.pdf(?:\/|$)/i)?.[1];
  return numero === estudioEsperado;
});

// Excepción documentada: septiembre de 2025.
// La página enlaza una ficha de otro estudio.
if (!ficha && estudioEsperado === '3524') {
  ficha = 'https://www.cis.es/documents/d/guest/es3524marMT_a';
}

if (!ficha) {
  throw new Error(
    `No se encontró ficha técnica del estudio ${estudioEsperado}`
  );
}

  if (!ficha || !estimacion) {
    throw new Error('Falta ficha técnica o PDF de estimación');
  }

  const [textoFicha, textoEstimacion] = await Promise.all([
    descargarTextoPDF(ficha),
    descargarTextoPDF(estimacion)
  ]);

  const datosFicha = extraerFicha(textoFicha);
  const datosEstimacion = extraerEstimaciones(textoEstimacion);

  if (datosFicha.estudio !== datosEstimacion.estudio) {
  throw new Error(
    `Estudios diferentes:
     Ficha técnica: ${datosFicha.estudio}
     Estimación voto: ${datosEstimacion.estudio}
     URL ficha: ${ficha}
     URL estimación: ${estimacion}`
  );
}

  const fecha_publicacion = buscarFechaPagina(
    html,
    'Fecha de publicación'
  );

  const fecha_avance = buscarFechaPagina(
  html,
  'Fecha de avance'
);

console.log('Fechas del estudio:', {
  estudio: datosFicha.estudio,
  avance: fecha_avance,
  publicacion: fecha_publicacion
});

  const encuesta = {
    instituto: 'CIS',
    estudio_id: datosFicha.estudio,
    fecha_publicacion,
    fecha_avance: buscarFechaPagina(html, 'Fecha de avance'),
    tipo: 'estimacion_voto',
    ambito: 'España',
    trabajo_campo_inicio: datosFicha.trabajo_campo_inicio,
    trabajo_campo_fin: datosFicha.trabajo_campo_fin,
    tamano_muestra: datosFicha.tamano_muestra,
    resultados: datosEstimacion.resultados,
    fuente: estimacion
  };

  if (
    encuesta.trabajo_campo_inicio > encuesta.trabajo_campo_fin ||
    encuesta.trabajo_campo_fin > encuesta.fecha_publicacion
  ) {
    throw new Error('Fechas del estudio incoherentes');
  }

  return encuesta;
}

async function main() {
  const respuesta = await fetch(URL_CIS, {
    signal: AbortSignal.timeout(30000)
  });

  if (!respuesta.ok) {
    throw new Error(`No se pudo consultar el CIS: ${respuesta.status}`);
  }

  const html = await respuesta.text();

  const barometros = enlacesHTML(html, URL_CIS)
    .filter(url => /\/estudios\/barometro-de-/i.test(url));

  console.log(`Barómetros encontrados: ${barometros.length}`);

  if (!barometros.length) {
    throw new Error('No se encontraron barómetros');
  }

  const encuestas = [];
  const errores = [];
  const identificadores = new Set();

  for (const url of barometros) {
    console.log(`\nProcesando: ${url}`);

    try {
      const encuesta = await procesarBarometro(url);
      const clave = `CIS-${encuesta.estudio_id}`;

      if (identificadores.has(clave)) {
        throw new Error(`Estudio duplicado: ${clave}`);
      }

      identificadores.add(clave);
      encuestas.push(encuesta);

      console.log(
  `Estudio ${encuesta.estudio_id} | Publicación: ${encuesta.fecha_publicacion} | Página: ${url}`
);
    } catch (error) {
      errores.push({ url, motivo: error.message });
      console.error(`✗ ${error.message}`);
    }
  }

  encuestas.sort((a, b) =>
    a.trabajo_campo_fin.localeCompare(b.trabajo_campo_fin)
  );

  console.log('\nRESUMEN');
  console.log('Encuestas procesadas:', encuestas.length);
  console.log('Estudios con incidencias:', errores.length);

  console.log('\nDATOS EXTRAÍDOS');
  console.log(JSON.stringify(encuestas, null, 2));
  if (encuestas.length > 0 && errores.length === 0) {
  await writeFile(
    'data/cis-prueba.json',
    JSON.stringify({
      version: 1,
      encuestas
    }, null, 2),
    'utf8'
  );

  console.log('Archivo de prueba generado: data/cis-prueba.json');
}

  if (errores.length) {
    console.log('\nINCIDENCIAS');
    console.log(JSON.stringify(errores, null, 2));
  }

  if (!encuestas.length || errores.length) {
    process.exitCode = 1;
  }
}

const meses = [
  'enero', 'febrero', 'marzo', 'abril',
  'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'
];

const ejecutarPruebas = process.argv[1]?.replaceAll('\\', '/')
  .endsWith('/cis-historico.mjs');

if (ejecutarPruebas) {

const estudiosPrueba = [
  'https://www.cis.es/es/estudios/barometro-de-septiembre-2023.-postelectoral-elecciones-generales-2023'
];

for (let anio = 2023; anio <= 2026; anio++) {
  for (let indice = 0; indice < meses.length; indice++) {
    if (anio === 2023 && indice < 9) continue;
    if (anio === 2026 && indice > 9) continue;
    if (indice === 7) continue; // Agosto

    estudiosPrueba.push(
      `https://www.cis.es/es/estudios/barometro-de-${meses[indice]}-${anio}`
    );
  }
}

console.log('Estudios previstos:', estudiosPrueba.length);

const encuestas = [];
const errores = [];

for (const url of estudiosPrueba) {
  try {
    const encuesta = await procesarBarometro(url);
    encuestas.push(encuesta);

    console.log(
      `✓ Estudio ${encuesta.estudio_id}:`,
      encuesta.resultados
    );
  } catch (error) {
    errores.push({ url, error: error.message });
    console.log(`✗ ${url}: ${error.message}`);
  }
}
await new Promise(resolve => setTimeout(resolve, 1500));

console.log('\nRESUMEN HISTÓRICO');
console.log('Estudios procesados:', encuestas.length);
console.log('Incidencias:', errores.length);
if (encuestas.length === 35 && errores.length === 0) {
  encuestas.sort((a, b) =>
    a.trabajo_campo_fin.localeCompare(b.trabajo_campo_fin)
  );

  await writeFile(
    'data/cis-historico-prueba.json',
    JSON.stringify({
      version: 1,
      encuestas
    }, null, 2),
    'utf8'
  );

  console.log(
    'Histórico guardado: data/cis-historico-prueba.json'
  );
}

if (errores.length) {
  console.log(errores);
}}
