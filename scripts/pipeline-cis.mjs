import { spawnSync } from 'node:child_process';

const pasos = [
    {
    nombre: 'Actualizar histórico CIS',
    archivo: 'scripts/actualizar-cis.mjs',
    argumentos: ['--pipeline-test', '--guardar']
  },
    {
  nombre: 'Actualizar fuentes generales',
  archivo: 'scripts/actualizar-fuentes-test.mjs',
  argumentos: []
},
  {
    nombre: 'Sincronizar radar',
    archivo: 'scripts/sincronizar-radar-cis.mjs',
    argumentos: ['--pipeline-test']
  },
{
    nombre: 'Validar resultados del pipeline',
    archivo: 'scripts/validar-pipeline.mjs',
    argumentos: []
  }
];

for (const paso of pasos) {
  console.log(`\n=== ${paso.nombre} ===`);

  if (!paso.archivo) {
    console.log('Etapa pendiente de integración aislada.');
    continue;
  }

  const resultado = spawnSync(
    process.execPath,
    [paso.archivo, ...paso.argumentos],
    { stdio: 'inherit' }
  );

  if (resultado.error || resultado.status !== 0) {
    throw new Error(
      `Pipeline cancelado: ${paso.nombre}`
    );
  }
}

console.log('\nPIPELINE FINALIZADO SIN ERRORES');
console.log('Resultados generados únicamente en carpeta de pruebas.');
