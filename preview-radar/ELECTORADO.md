# Electorado · CIS 3582

La versión unificada parte de `main` (`8e3424d`). Recupera las interfaces de
`75867d5`, `79eeec3` y `e98e4c29`, junto con los tres JSON y sus scripts de R.
«¿Cómo hemos cambiado?» conserva los datos y el código del PR #11.

## Vista previa

Desde la raíz del repositorio, ejecuta `node preview-radar/serve.cjs`.
Abre [Electorado](http://127.0.0.1:8092/preview-radar/#electorado).
El servidor debe servir el repositorio completo para que funcionen las rutas de fuentes.

## Bases y comparabilidad

- Problemas de España. Se usa PESO sobre las 5.024 entrevistas en el total y
  sobre la base de cada grupo para los desgloses. Cada persona cuenta una vez
  por tema. Se ocultan los desgloses con menos de 30 menciones nacionales.
- Comparador. Ambas preguntas usan la misma base de 5.024 entrevistas y el
  mismo peso. Las brechas se expresan en puntos porcentuales. Las cuatro
  situaciones de solapamiento corresponden a las dos preguntas de cada persona.
- Perfil social. Cada distribución usa respuestas válidas para su variable.
  Cada cruce usa respuestas válidas para ambas variables, también para su
  referencia general. Al invertir el cruce cambia el grupo que sirve de
  denominador. Las bases efectivas orientan la interpretación de las estimaciones.
- El histórico mantiene sus notas sobre comparabilidad. Los recuentos n
  de los tres bloques recuperados se muestran sin ponderar.

## Explora la sociedad

El análisis R exporta las sumas de PESO y el porcentaje ponderado de cada
celda. Sus umbrales de tamaño muestral clasifican la estabilidad de la
estimación. En `cff57df` la interfaz convirtió esa clasificación en una
reserva bidireccional. La base efectiva de la posición ideológica 9 (19,94)
afectaba así a todas las franjas de edad. La vista ahora muestra los
porcentajes de todas las categorías y explica la cautela muestral en
«¿Cómo se calcula?». Los artículos 6, 7 y 9 de la
[Orden PRE/3188/2008](https://www.boe.es/eli/es/o/2008/10/30/pre3188)
regulan el uso de los datos del CIS y las tabulaciones a medida, sin
establecer esos umbrales. El Atlas usa los agregados ya calculados y
atribuye la fuente al CIS 3582.

Cada selección suma las ponderaciones de sus categorías. El resto suma
las de las categorías restantes. Ambos usan el denominador del grupo y el
redondeo se aplica al mostrar el porcentaje. El detalle se abre junto al
segmento con cursor, foco o toque. Escape lo cierra.

## Pruebas

Con Playwright y Microsoft Edge instalados, ejecuta los tres archivos
`electorado*.spec.cjs` en `preview-radar/tests` con Node. Para la serie
histórica, ejecuta `node --test preview-radar/tests/evolucion-cis.test.mjs`.
