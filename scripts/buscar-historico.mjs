const meses = [
  'enero', 'febrero', 'marzo', 'abril',
  'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'
];

const pausa = ms => new Promise(resolve => setTimeout(resolve, ms));

const encontrados = [];
encontrados.push({
  mes: 'septiembre',
  anio: 2023,
  url: 'https://www.cis.es/es/estudios/barometro-de-septiembre-2023.-postelectoral-elecciones-generales-2023'
});
const ausentes = [];

for (let anio = 2023; anio <= 2026; anio++) {
  for (let indice = 0; indice < 12; indice++) {
    if (indice === 7) continue; // Agosto: sin barómetro mensual
    if (anio === 2023 && indice < 8) continue;
    if (anio === 2026 && indice > 9) continue;

    const mes = meses[indice];
    const url = `https://www.cis.es/es/estudios/barometro-de-${mes}-${anio}`;

    try {
      const respuesta = await fetch(url, {
        signal: AbortSignal.timeout(30000)
      });

      if (respuesta.url.includes('__cis_antibot')) {
        throw new Error('Comprobación de acceso');
      }

      const html = await respuesta.text();
      const titulo = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();

      if (titulo?.includes('Comprobación de acceso')) {
        throw new Error('Comprobación de acceso');
      }

      if (
        respuesta.ok &&
        titulo?.includes(`Barómetro de ${mes} ${anio}`)
      ) {
        encontrados.push({ mes, anio, url });
        console.log(`✓ ${mes} ${anio}`);
      } else {
        ausentes.push({ mes, anio, estado: respuesta.status });
        console.log(`— ${mes} ${anio}: no encontrado`);
      }
    } catch (error) {
      console.log(`Error en ${mes} ${anio}: ${error.message}`);
      console.log('Búsqueda interrumpida.');
      process.exit(1);
    }

    await pausa(1000);
  }
}

console.log('\nRESUMEN');
console.log('Barómetros encontrados:', encontrados.length);
console.log('Meses sin resultado:', ausentes.length);
console.log('Lista de meses sin resultado:', ausentes);
