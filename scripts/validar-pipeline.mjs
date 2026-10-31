import { readFileSync } from 'node:fs';

const carpeta = 'data/pipeline-test/data';

const radar = JSON.parse(
  readFileSync(`${carpeta}/radar-sincronizado.json`, 'utf8')
);

const historico = JSON.parse(
  readFileSync(`${carpeta}/cis-historico.json`, 'utf8')
);

if (!Array.isArray(radar.encuestas) ||
    !Array.isArray(historico.encuestas)) {
  throw new Error('VALIDACIÓN FALLIDA: estructura incorrecta');
}

const cis = radar.encuestas.filter(e => e.instituto === 'CIS');

const idsRadar = cis.map(e => String(e.estudio_id));
const idsHistorico = historico.encuestas.map(e => String(e.estudio_id));

if (
  idsRadar.length === 0 ||
  new Set(idsRadar).size !== idsRadar.length ||
  new Set(idsHistorico).size !== idsHistorico.length ||
  idsRadar.length !== idsHistorico.length ||
  idsHistorico.some(id => !idsRadar.includes(id))
) {
  throw new Error('VALIDACIÓN FALLIDA: histórico CIS y radar no coinciden');
}

for (const encuesta of historico.encuestas) {
  const id = encuesta.estudio_id;

  if (
    encuesta.instituto !== 'CIS' ||
    !/^\d+$/.test(String(id ?? '')) ||
    encuesta.tipo !== 'estimacion_voto' ||
    !encuesta.ambito ||
    !encuesta.fuente
  ) {
    throw new Error(`Estudio ${id}: campos obligatorios incorrectos`);
  }

  const fechas = [
    'fecha_publicacion',
    'fecha_avance',
    'trabajo_campo_inicio',
    'trabajo_campo_fin'
  ];

  for (const campo of fechas) {
    const fecha = encuesta[campo];

    if (
      typeof fecha !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
      !Number.isFinite(Date.parse(`${fecha}T00:00:00Z`))
    ) {
      throw new Error(`Estudio ${id}: fecha incorrecta en ${campo}`);
    }
  }

  if (encuesta.trabajo_campo_inicio > encuesta.trabajo_campo_fin) {
    throw new Error(`Estudio ${id}: trabajo de campo invertido`);
  }

  if (
    !Number.isInteger(encuesta.tamano_muestra) ||
    encuesta.tamano_muestra <= 0
  ) {
    throw new Error(`Estudio ${id}: tamaño muestral incorrecto`);
  }

  const resultados = Object.values(encuesta.resultados ?? {});

  if (
    resultados.length === 0 ||
    resultados.some(
      valor => typeof valor !== 'number' ||
               !Number.isFinite(valor) ||
               valor < 0 ||
               valor > 100
    ) ||
    resultados.reduce((total, valor) => total + valor, 0) > 100.01
  ) {
    throw new Error(`Estudio ${id}: porcentajes electorales incorrectos`);
  }
}

const cisPorId = new Map(
  cis.map(encuesta => [String(encuesta.estudio_id), encuesta])
);

for (const original of historico.encuestas) {
  const copia = cisPorId.get(String(original.estudio_id));

  if (!copia) {
    throw new Error(
      `Estudio ${original.estudio_id}: ausente del radar`
    );
  }

  const partidosOriginales = Object.keys(original.resultados).sort();
  const partidosRadar = Object.keys(copia.resultados ?? {}).sort();

  if (
    JSON.stringify(partidosOriginales) !==
    JSON.stringify(partidosRadar)
  ) {
    throw new Error(
      `Estudio ${original.estudio_id}: partidos diferentes`
    );
  }

  for (const partido of partidosOriginales) {
    if (original.resultados[partido] !== copia.resultados[partido]) {
      throw new Error(
        `Estudio ${original.estudio_id}: porcentaje diferente para ${partido}`
      );
    }
  }
}

console.log('COHERENCIA DE PORCENTAJES CIS-RADAR SUPERADA');

console.log('VALIDACIÓN DE CAMPOS Y PORCENTAJES SUPERADA');

console.log(`VALIDACIÓN SUPERADA: ${cis.length} estudios CIS sincronizados`);
