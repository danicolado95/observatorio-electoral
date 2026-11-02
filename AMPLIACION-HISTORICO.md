> Informe histórico de trabajo. Estado actual: [CONSOLIDACION-RADAR.md](CONSOLIDACION-RADAR.md).

# Atlas Electoral: ampliación real del histórico

1 de noviembre de 2026. Preparado y verificado para la copia local de observatorio-electoral, rama desarrollo. Sin commit, push ni publicación.

## Resultado

| Métrica | Antes | Después |
|---|---:|---:|
| Encuestas privadas | 248 | 447 |
| CIS oficiales | 35 | 35 |
| Total | 283 | 482 |
| Institutos privados | 21 | 24 |
| Institutos incluyendo CIS | 22 | 25 |

199 altas netas: 157 ElectoPanel, 23 KeyData, 14 InvyMark, 1 Data10, 3 More in Common y 1 Sigma Dos. Sondaxe (3) y Winston (2) ya estaban incorporados: se han recuperado y contrastado sus publicaciones, sin contarlos otra vez. La cuarta mención Sondaxe corresponde a CIS reestimado y sigue fuera.

El balance provisional de 449 se redujo a 447 al revisar otras dos referencias compartidas entre oleadas de InvyMark. No se han ocultado como duplicados exactos: permanecen en cuarentena con la razón individual. De las 17 InvyMark antes excluidas por muestra ausente, entran 14; tres esperan referencias propias.

## Mediana exacta de 21 días

Ventana [t−20, t], por fin de campo; última encuesta por instituto antes de filtrar partido; tres institutos como mínimo; mediana sin pesos por tamaño de muestra. Publicación conocida: el estudio no puede entrar antes de ese día. La abscisa de cada punto de encuesta es el fin de campo. Los partidos ausentes no se convierten en cero y las coaliciones no se fusionan.

Intervalo común: 23/07/2023–01/11/2026, 1.198 días naturales, incluyendo días previos al primer dato. CIS desactivado:

| Partido | Días con mediana antes → después | Días sin base antes → después | Tramos de hueco antes → después |
|---|---:|---:|---:|
| PP | 733 → 1039 | 465 → 159 | 52 → 21 |
| PSOE | 733 → 1039 | 465 → 159 | 52 → 21 |
| VOX | 733 → 1039 | 465 → 159 | 52 → 21 |
| SUMAR | 729 → 1035 | 469 → 163 | 53 → 22 |

Se ganan 306 días válidos por partido. El mayor hueco pasa de 44 días (29/11/2025–11/01/2026) a 35 días iniciales (23/07/2023–26/08/2023). El JSON de cobertura lista todos los huecos y el CSV contiene las medianas diarias y el número de institutos, con CIS OFF y ON. No se interpolan huecos para mejorar la apariencia.

## Auditoría metodológica

- ElectoPanel: 171 menciones revisadas por registro. Entran 157 con ficha/recogida propia y fin de campo concordante. Se identifican como panel online voluntario ponderado, no probabilístico, con respuestas recurrentes. Los valores de voto proceden de la revisión Wikipedia archivada; las publicaciones originales y fichas se han cotejado para acreditar identidad, ámbito y recogida, sin saltarse contenido restringido. No se afirma cotejo numérico primario completo de todos los porcentajes.
- Permanecen 14 menciones EM en cuarentena: dos por mismo campo con resultados distintos; las demás por página no recuperable, ficha ausente o fechas discordantes. Las fichas antiguas usadas como imagen principal no validan una oleada posterior. La selección conserva la ficha concordante dentro de la publicación.
- More in Common: tres encuestas CAWI con datos propios, no mera extrapolación del CIS. El nombre de la organización dejó de causar su exclusión. Sus valores siguen atribuidos a la tabla archivada y sus documentos originales.
- InvyMark: la falta de n deja de excluir. Tres oleadas con referencia de una entrega posterior se mantienen fuera hasta acreditar su publicación y campo propios.
- KeyData y Data10: se recuperan 24 registros previamente excluidos por n, con referencias originales recuperadas. Campos y valores conservan trazabilidad a la tabla Wikipedia; descargar un original no supone certificar cada valor de su texto o imagen.
- CIS reestimado, modelos sin muestra propia y estudios internos sin acreditación continúan fuera; los 35 CIS oficiales se conservan en su canal.

## Fechas, muestra y evidencia

Se conservan fecha_publicacion, fecha_fin_campo y tipo_fecha, además de los nombres anteriores trabajo_campo_inicio y trabajo_campo_fin. Una publicación pública sin fecha conocida puede usar el fin de campo verificado, con asterisco y evidencia pública obligatoria. El código no copia una fecha de campo al campo publicación. En el único registro sin publicación bibliográfica (Sigma Dos), el original aportó article:published_time y datePublished concordantes: 20/04/2025; se preserva también el null original. Por tanto, el lote final no contiene fechas de publicación desconocidas; la alternativa y el asterisco quedan comprobados con pruebas.

La ficha del 13/08/2023 acredita campo 05–11/08/2023 y formulario online. Se conserva la captura aportada. Su muestra no se fuerza: la ficha presenta totales y subgrupos no conciliados con la tabla secundaria. Otra discordancia de OCR tampoco se convierte en un n inventado. n queda null en ambos casos y no afecta a la mediana.

La auditoría conserva fuentes, revisión permanente, atribución CC BY-SA 4.0, bytes originales, hashes SHA-256, fechas de recuperación, imágenes, OCR y decisiones por estudio. No se ha importado la tabla Mapa Electoral ni utilizado el feed Electográfica.

Fuentes de ejemplo: [ElectoPanel 13/08/2023](https://electomania.es/electopanel-13ag-adelanto-baja-vox-minimos-para-erc/), [More in Common: modelo y encuesta propia](https://moreincommones.substack.com/p/lanzamos-nuestro-propio-modelo-de), [revisión Wikipedia utilizada](https://en.wikipedia.org/w/index.php?title=Opinion_polling_for_the_2026_Spanish_general_election&oldid=1383194971).

## Implementación y verificación

Cambios: contrato histórico optativo sin relajar el actualizador general; manifiesto de revisión por registro; constructor local que conserva el histórico, bloquea revisiones contradictorias y detecta republicaciones por instituto/campo; puntos y fichas por fin de campo; fechas alternativas; recálculo y exportación reproducibles. Nuevas oleadas EM no heredan la aceptación de las anteriores.

52 pruebas superadas: 34 JavaScript y 18 Python. Construcción repetida idempotente y ciclo completo del actualizador ejecutado contra el HTML real archivado; el ciclo conserva las 482 encuestas. Navegador local: selector Desde 23J, CIS OFF/ON (447/482), ficha de panel y captura de pantalla. No se ha activado el servicio diario ni realizado publicación de red.

## Límites pendientes

Cobertura parcial. La auditoría individual y los originales recuperados no equivalen a un cotejo numérico completo de todos los gráficos. Persisten huecos reales, 14 menciones EM y tres InvyMark pendientes, además de otras cuarentenas ya documentadas. La ingesta diaria mantiene la revisión por registro; no se presenta como una automatización de aceptación de todos los modelos.

## Reproducción

Desde la raíz del repositorio:

```text
node scripts/preparar-radar-wikipedia.mjs
node scripts/medir-cobertura.mjs
node --test test/*.test.mjs
python test/importar-wikipedia_test.py
python test/actualizar-wikipedia_test.py
```

La auditoría de originales se reproduce con auditar-fuentes.mjs, extraer-evidencia.py, descargar-fichas.mjs, OCR local y ampliar-historico.py. Se entrega el archivo de evidencia para no depender de que las páginas sigan siendo accesibles.
