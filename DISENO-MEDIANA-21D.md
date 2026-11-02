> Informe histórico de trabajo. Estado actual: [CONSOLIDACION-RADAR.md](CONSOLIDACION-RADAR.md).

# Propuesta pendiente: mediana móvil de 21 días

No implementada en este cambio. El cálculo de la web sigue siendo la media
gaussiana de ancho 14 días y ventana de 42 días. Primero debe validarse la
ingesta con datos reales, procedencia, licencias, duplicados y cobertura.

## Contrato propuesto para validar antes de sustituir la función

1. CIS OFF por defecto. ON incluye sus filas y recalcula desde los datos,
   tanto puntos visibles como selección de institutos y medianas. No basta
   con ocultar o mostrar una curva ya calculada.
2. Para cada día UTC t, usar los 21 días naturales inclusivos [t-20, t].
   Excluir publicaciones posteriores a t aunque su campo termine antes:
   la serie histórica no debe usar información todavía no publicada.
   Esta convención evita ambigüedad con «antigüedad <=21», que serían 22 fechas.
3. Seleccionar UNA última encuesta por instituto normalizado, según fin de campo;
   desempatar por publicación. Un empate restante con estudios distintos requiere
   revisión, sin preferir el orden de entrada. Mismo estudio repetido se resuelve
   antes, en ingesta. Aplicar un catálogo explícito y auditado de alias privados.
4. Seleccionar estudio antes de filtrar por partido: si el último estudio no
   informa un partido, su aportación para él queda ausente; no recuperar uno viejo.
5. Para cada partido contar solo institutos con porcentaje finito en esa selección.
   Con >=3 institutos: mediana ordenada; si n es par, promedio de los dos centrales.
   Con menos de 3: value:null y n real. Cada instituto pesa uno; sin pesos muestrales
   ni temporales, sin correcciones por casa ni bandas de incertidumbre.
6. Mantener huecos, sin interpolar null, sin extrapolar más allá de la última
   observación disponible de las casas seleccionables. El 23J es referencia,
   nunca una encuesta. No renormalizar porcentajes ni forzar que medianas sumen 100.
7. Exponer por punto fecha, valor, n de institutos y IDs seleccionados para auditoría.
   Mostrar en interfaz «Mediana móvil, 21 días; última encuesta por instituto;
   mínimo 3 institutos», y estado sin base suficiente cuando corresponda.

## Validación de aceptación del cambio posterior

- Fixtures manuales: medianas impares/pares; 2 frente a 3 casas; múltiples estudios
  de una casa; alias; datos sin partido; empate; fronteras t-20 y t-21; publicaciones
  tardías; fecha futura; CIS ON/OFF que cruce el umbral de 3; huecos y 23J.
- A igualdad de datos congelados, comparar ambas series en pruebas sin activar la
  nueva en la web: días con valor/null, casas seleccionadas y diferencia en puntos
  porcentuales por partido (máxima absoluta y mediana absoluta). Publicar conteos y
  fechas de cobertura, sin presentar la divergencia como error de una de las series.
- Esperable: menos efecto de casas que publican mucho y menor influencia de extremos;
  ventana más corta puede generar más huecos. Es una diferencia metodológica, no
  una promesa de mayor precisión ni un pronóstico electoral.
- Solo tras revisar esa comparación, cambiar función/UI/etiquetas de forma conjunta
  y repetir pruebas y comprobación visual. No ejecutar simultáneamente la sustitución
  de fuentes y de metodología en la versión usada por la web.
