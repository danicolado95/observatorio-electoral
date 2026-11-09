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
  denominador. Las bases efectivas y las reglas de ocultación se conservan.
- El histórico mantiene sus notas sobre comparabilidad. Los recuentos n
  de los tres bloques recuperados se muestran sin ponderar.

## Distribuciones parciales en Explora la sociedad

En ideología por edad, el grupo de 45–54 años tiene 1.063 entrevistas
válidas y una base efectiva de 631,7. La posición 9 tiene entre 1 y 9 casos.
En `3d10b6c` el listado seguía mostrando las otras nueve posiciones;
`acdbd14` retiró ese listado y ocultó toda la barra cuando faltaba una celda.

Los grupos completos mantienen la barra al 100 % y los agregados ponderados.
En grupos parciales, las categorías disponibles se presentan en intervalos
de cinco puntos porcentuales con el denominador ponderado del grupo. Se aplica
la reserva en los dos sentidos del cruce y se omiten los agregados y la suma
de pesos en la interfaz. Así, el espacio de la barra, el total de porcentajes
exactos y el cambio de selección no exponen el complemento reservado. Esta
es una regla de presentación. El JSON y el análisis R siguen accesibles e
íntegros y contienen las cifras originales.

El detalle de las barras se abre junto a la barra con cursor, foco o toque.
Escape lo cierra. El detalle visual muestra categoría, porcentaje y aviso,
y el lector de pantalla dispone también del grupo y su base.

## Pruebas

Con Playwright y Microsoft Edge instalados, ejecuta los tres archivos
`electorado*.spec.cjs` en `preview-radar/tests` con Node. Para la serie
histórica, ejecuta `node --test preview-radar/tests/evolucion-cis.test.mjs`.
