# Radar: mejora estructural, primera entrega

Fecha: 2 de noviembre de 2026. Rama: `desarrollo`.

## Estado y alcance

El repositorio estaba limpio al comenzar. Se dejan cambios sin commit para revisar en GitHub Desktop. No se ha cambiado `main`, ningún workflow, cron, publicación, diseño, etiqueta, partido ni metodología. No se han ejecutado GitHub Actions ni realizado commit o push.

Esta entrega completa una primera fase de auditoría de conservación y comparación temporal. **No certifica el pipeline integral Wikipedia → Electográfica → reconciliación → auditoría.**

## Cambios

- `scripts/validar-integracion-manual.mjs`: nueva función `auditar()` que devuelve incidencias e inventario; `verificar()` mantiene el bloqueo mediante `AggregateError`, adjuntando el informe. Recorre los registros históricos de las cuatro colecciones y acumula diferencias independientes por campo, partido y referencia. Un alias no resuelto registra el bloqueo y la comparación dependiente como no evaluable, y continúa con otros registros.
- Las incidencias contienen `etapa`, `fuente`, `estudio_id`, `campo`, `codigo`, `esperado`, `observado`, `evidencia` y `severidad`. En controles generales sin estudio o comparación escalar aplicable se utiliza `null`.
- Las dos fechas Blogger se comparan como instantes tanto por ID exacto como por alias, validando calendario, hora y zona. Se admiten `.630` y `.63`, y desplazamientos horarios equivalentes. La normalización opera sobre copias. El resto de `ingestion`, los campos civiles y resultados mantienen sus controles estrictos.
- La lectura del comando reúne todos los archivos ausentes o ilegibles. Escribe `data/pipeline-test/integracion-validacion.json` antes de terminar con error. Si falta el combinado, conserva el inventario de las colecciones legibles y marca la comparación dependiente como no evaluable.
- `scripts/referencias-historicas.mjs`: revisa todos los estudios y campos comparables antes de recuperar referencias. Acumula duplicados, estudios ausentes y conflictos. Si falla cualquier comprobación, no aplica ninguna recuperación parcial.
- `scripts/importar-electografica.mjs`: ante conflictos de recuperación de referencias guarda el informe agregado en `electografica/referencias-validacion.json` y en `integracion-validacion.json`, y bloquea sin sustituir el radar anterior.
- El workflow ya incluye `integracion-validacion.json` en su artifact con `if: always()`. No se ha modificado ni ejecutado; la persistencia local de esa ruta está probada.

## Evidencia y cobertura

El inventario `cobertura-historico.json` incluye todos los identificadores, clasificaciones, resultados y referencias del histórico, además de hashes SHA-256. Los tres JSON versionados cotejados coinciden en contenido con HEAD:

| Archivo | Privadas | CIS | Referencias adicionales |
| --- | ---: | ---: | ---: |
| `data/radar.json` | 0 | 35 | 0 |
| `data/radar-desarrollo.json` | 480 | 35 | 233 |
| `data/cis-historico.json` | 0 | 35 | 0 |

Estas colecciones se solapan: las filas no se suman como encuestas distintas. El inventario acredita el histórico existente, no su reconstrucción desde las fuentes.

Las pruebas incluyen comparación horaria por ID y alias; diferencias de milisegundo; fechas inválidas; comparación estricta de `entry_id`, `content_sha256` y `source`; pérdidas de registros, ceros y referencias; separación FA/SUMAR; múltiples errores; bloqueo y ausencia de mutaciones parciales; informe con fuentes ausentes y repetición determinista. La prueba existente de recuperación recorre las 233 referencias reales y las recupera dos veces sin duplicarlas. La prueba existente del importador reconstruye desde un snapshot representativo de una entrada GAD3, preserva las 515 encuestas y repite la ejecución sin cambiar el radar.

Ejecución de revisión: `node --test --test-reporter=spec test/*.test.mjs`. Resultado: 102 pruebas, 100 superadas, 2 omitidas, 0 fallidas. Registro completo en `pruebas-javascript.txt`.

La autodetección amplia `node --test` también incorpora `scripts/importar-general-test.mjs`, una utilidad que exige argumentos y termina mostrando su uso. Esa ejecución amplia falla por dicha utilidad; la batería anterior ejecuta expresamente el directorio de pruebas. No se ha modificado esa utilidad.

## Limitaciones y pendientes

1. Python no está disponible en este equipo. No se han ejecutado las pruebas Python ni la extracción de Wikipedia.
2. Falta el snapshot completo local de Electográfica y sus salidas en `data/pipeline-test/electografica`. Las dos pruebas existentes que requieren ese snapshot se omiten. La ejecución real del auditor termina bloqueada por cuatro archivos ausentes; su informe se entrega como `integracion-validacion.json`.
3. Falta construir fixtures completas o representativas de ambos adaptadores, con el mismo `asOf`, y ejecutar desde cero Wikipedia → preparación → Electográfica → reconciliación → auditoría, reiniciando y repitiendo. No se han fabricado datos para aparentar esa verificación.
4. Otros puntos tempranos del importador y de preparación de Wikipedia siguen siendo bloqueantes: reconciliación con salida previa, enriquecimiento previo, lecturas iniciales, snapshot inválido, conflictos históricos y republicaciones. Su acumulación y persistencia integral quedan pendientes. El nuevo informe del importador cubre específicamente los conflictos de recuperación de referencias.
5. La resolución de alias conserva sus requisitos estrictos de prueba única y procedencia. Una prueba de alias inválida detiene esa cadena dependiente; no se afirma que enumere todos los defectos internos posibles del mismo alias o enriquecimiento. La auditoría continúa con las demás encuestas y campos evaluables. Registros con estructura JSON radicalmente inválida pueden producir un diagnóstico estructural general; falta granularidad por registro para esos casos.
6. La auditoría de conservación no sustituye la validación de candidatos nuevos de los adaptadores. Tampoco demuestra todavía conservación tras una reconstrucción integral de las 480 privadas, 35 CIS y 233 referencias: demuestra el inventario intacto y las pruebas acotadas descritas.
7. Se recuperó el contexto de la conversación previa. La consulta directa al directorio externo de GitHub no pudo recuperarse en esta sesión. Esta entrega se basa en la inspección del Atlas y el diagnóstico previo aportado; no atribuye capacidades verificadas nuevas al repositorio externo.

## Archivos para revisar

Tres scripts de auditoría/referencias/importación modificados, una prueba existente ampliada, una prueba nueva y este informe. Los archivos de datos versionados permanecen fuera del diff. Los informes de ejecución del pipeline quedan en la carpeta local ignorada `data/pipeline-test/`; los entregables adjuntos incluyen copia del informe bloqueado y del inventario.
