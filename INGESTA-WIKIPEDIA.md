> Informe histórico de trabajo. Estado actual: [CONSOLIDACION-RADAR.md](CONSOLIDACION-RADAR.md).

# Importación real de Wikipedia — 1 noviembre 2026

Solo desarrollo y staging local. Sin publicación, commit ni push. No se ha usado
el feed de Electográfica. El pipeline de producción y su validador siguen intactos.

## Resultado

- Sección Voting intention estimates, cinco tablas de 2023–2026: 563 registros.
- 289 privadas con publicación, campo, porcentajes y enlace original utilizables
  en staging; 22 institutos, 29 dominios de referencia y 17 partidos/coaliciones.
- 248 pasan además el contrato estricto actual: 21 institutos y 28 dominios.
  Se unen a los 35 CIS existentes en el radar LOCAL (283 en total).
- Las otras 41 se conservan completas, con muestra null; no se inventa ese campo.
  El validador actual exige muestra positiva y no se ha relajado.
- Publicaciones: 2023-08-13 a 2026-11-01. Fin de campo: 2023-08-07 a 2026-10-28.
  No se acredita cobertura completa desde el 23J ni continuidad diaria.
- 274 registros en cuarentena, incluidos 90 CIS/proyecciones CIS que no se
  reimportan, 171 Electopanel pendientes de metodología y otros casos internos,
  publicación ausente, porcentajes o conflictos. Los motivos se solapan.
- 0 duplicados exactos eliminados en este original. Seis filas en tres grupos
  contradictorios instituto/campo quedan en cuarentena, no se elige una versión.

## Procedencia y licencia

Fuente: https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Spanish_general_election

Revisión indicada por el HTML descargado: oldid=1383194971. Original exacto bajo
`data/pipeline-test/wikipedia/archive/35cc0463c51da2011b3068378170d037bbf713949e38a59f64909cbd24db4e8e/`.
La descarga fue de la página actual, cuyo enlace permanente identifica esa revisión;
no se afirma haber realizado una segunda descarga independiente del oldid.

Datos derivados: Wikipedia contributors, CC BY-SA 4.0:
https://creativecommons.org/licenses/by-sa/4.0/

Se conservan historial, revisión, enlace de licencia y modificaciones (conversión
de tablas a JSON, normalización y filtros), tanto en JSON como en la interfaz.
Los enlaces externos son referencias; no se redistribuyen sus artículos o gráficos.
Electográfica puede figurar en las referencias originales preservadas de Wikipedia,
pero no se ha consultado ni se acepta como único enlace original de una encuesta.

La publicación se obtiene de la fecha bibliográfica explícita de la referencia,
no del campo, acceso, archivo o URL. Con varias referencias se toma la primera
publicación acreditada que no contradiga el campo. Esto acredita lo consignado
en Wikipedia; no representa comprobación individual de los 289 artículos.
Se contrastaron directamente dos ejemplos históricos en elDiario.es y EL PAÍS.
El enlace reciente de La Voz no fue accesible con el navegador de consulta.

## Archivos y reproducción

1. Descargar la página una vez y conservar su HTML (no convertirlo en texto).
2. `python scripts/importar-wikipedia.py --html ORIGINAL.html --today 2026-11-01`
3. `node scripts/preparar-radar-wikipedia.mjs`
4. Servir el repositorio en localhost y abrir `/?radar=staging#encuestas`.

El selector staging solo funciona en localhost/127.0.0.1/::1. Sin ese selector
se lee el radar existente. `data/radar.json`, registro de fuentes, workflows y CIS
no se modifican. Los JSON nuevos están en la carpeta pipeline-test ya ignorada.

`staging.json`: filas útiles, cuarentena, motivos, celdas originales, referencias,
índices de tabla/fila, hash y atribución. `report.json`: conteos por instituto,
dominio, partido y ausencias. `radar.json`: instantánea local validada y combinada.
El constructor hace merge append-only con su staging previo; un conflicto aborta
antes del reemplazo atómico. Repetirlo conserva las 283 encuestas sin duplicarlas.

## Mediana e interfaz

`RadarCore.medianTrend()` conserva el cálculo anterior para comparación. Ventana
inclusiva [t-20,t] por fin de campo, publicación <=t, última encuesta por instituto
antes de seleccionar partido, mínimo tres valores y mediana impar/par. Empates
ambiguos excluyen la casa; ausencias permanecen ausencias. Sin interpolar huecos,
sin prolongar la serie después de la última publicación disponible, sin fusionar
Sumar, FA o FV y sin convertir el resultado del 23J en encuesta.

CIS OFF por defecto; ON vuelve a seleccionar estudios y recalcula las mismas
líneas. En los datos congelados modifica 50 fechas del PP, 51 PSOE, 47 VOX,
51 SUMAR y 42 PODEMOS. El último valor coincide porque no hay CIS elegible en
esa ventana final. La primera mediana de PP/PSOE/VOX/SUMAR es 2023-09-04.
`median-comparison.json` contiene métricas y diferencias frente al cálculo anterior.

Comprobado en navegador: histórico, huecos, seis partidos seleccionados inicialmente,
selectores de los 17 partidos, CIS 248/283, atribución y fichas enlazadas. En staging
se ocultan los bloques antiguos de simulación dentro de Encuestas para no mezclarlos.
Las otras secciones siguen siendo prototipos: esto no acredita una V1 terminada.

## Pruebas y pendientes exactos

28 pruebas Node (23 anteriores + 5 mediana) y 15 Python: 43 superadas.
Python usa solo biblioteca estándar. Ejecutar:

```
node --test test/radar.test.mjs test/radar-regressions.test.mjs test/validar-pipeline.test.mjs test/importar-general.test.mjs test/mediana.test.mjs
python test/importar-wikipedia_test.py -v
```

Pendientes: admitir metadatos opcionales mediante un contrato revisado para las
41 filas sin muestra; contrastar referencias pendientes/conflictos; ampliar cobertura
y automatizar comprobación diaria con caché y gestión de errores. No se ha creado
una tarea diaria ni cambiado el actualizador público. Electográfica sigue pendiente
de permiso. La integración pública requiere revisión posterior y autorización.
