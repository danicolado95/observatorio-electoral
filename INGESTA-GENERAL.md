> Informe histórico de trabajo. Estado actual: [CONSOLIDACION-RADAR.md](CONSOLIDACION-RADAR.md).

# Ingesta general: prototipo aislado (2026-11-01)

Base revisada: desarrollo, 17ca9a1a2896d5ac423f4ab76370ffb2bce88e58.
Radar existente: 35 estudios, todos CIS. Fuentes generales habilitadas: 0.
Encuestas privadas reales descargadas/importadas en esta intervención: 0.
No se acredita cobertura histórica. Las fixtures son sintéticas.

## Decisión sobre fuentes, antes de implementar

Electográfica: la portada y «Sobre Electográfica» muestran copyright, sin una
licencia explícita de reutilización en las páginas consultadas. No se concluye
que todo acceso esté prohibido: se mantiene deshabilitada hasta documentar el
permiso aplicable a extracción sistemática, conservación y redistribución.
El acceso público o un feed Blogger no acreditan esos permisos. No se ha enviado
ninguna solicitud de autorización ni descargado su histórico.

- https://www.electografica.com/
- https://www.electografica.com/p/sobre-e-lectografica.html
- robots.txt no fue accesible con el navegador de consulta; no se declara verificado.

La vía de referencia sería el feed Blogger con etiquetas Generales y
Generales_CCAA. Esta última es infraestatal: nunca sumar sus porcentajes al total
nacional ni considerarlos encuestas nacionales. Falta verificar acceso actual,
paginación completa, formatos históricos y cambios de etiquetas. Google avisa
de la retirada de API v2 en 2024 y de diferencias en GET que siguen funcionando:
https://developers.google.com/blogger/docs/2.0/developers_guide_protocol
No se copió código de Mapa Electoral ni se asumió que su uso otorgue derechos.

Wikipedia: sus términos permiten reutilizar contenido bajo la licencia aplicable
y exigen atribución, enlace de licencia e indicación de modificaciones. Para
CC BY-SA 4.0 hay obligación de compartir adaptaciones bajo la misma licencia.
Los derechos de textos, gráficos y documentos externos requieren revisión propia.
No hay un bloqueo legal general de Wikipedia: el impedimento actual es técnico,
faltan un adaptador de tablas validado y metadatos suficientes para nuestro esquema.

- https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use (sección 7)
- https://creativecommons.org/licenses/by-sa/4.0/
- https://en.wikipedia.org/wiki/Opinion_polling_for_the_next_Spanish_general_election
- https://www.mediawiki.org/wiki/API:Etiquette

Para el futuro adaptador: usar revisión permanente (oldid), conservar referencias
originales y atribución a autores/historial; texto y datos derivados con aviso de
licencia y transformaciones. Solicitudes en serie, User-Agent con contacto real,
caché, maxlag y respeto de Retry-After; no evadir bloqueos. Estas consultas no
verifican individualmente las licencias de todos los medios e institutos.

## Alcance implementado

`scripts/importar-general-test.mjs` acepta únicamente una fuente autorizada
`normalized-json-v1`, el mismo contrato que el actualizador existente:
`{version:1, encuestas:[...]}`. Es infraestructura de ingesta general reutilizable;
NO es todavía un extractor Blogger/Wikipedia ni un recopilador histórico completo.
No hay fuente real nueva habilitada. No se modifican registro, pipeline CIS,
workflow, publicacion, validador, actualizador ni cálculo de tendencia existentes.

Comando, cuando exista un manifiesto revisado de una fuente compatible:

```
node scripts/importar-general-test.mjs --pipeline-test --source manifiesto.json
```

Manifiesto: id seguro, enabled, adapter, url HTTPS, allowedHosts y rights con
redistribution:true, reviewedBy, reviewedAt, evidenceUrl. La revisión debe ser
humana y acreditada, igual que en el pipeline existente; el programa no verifica
por sí mismo la veracidad jurídica de esa declaración. No se incluyen permisos
ficticios para fuentes reales. Los únicos permisos ficticios están en los tests.

Todo se escribe bajo `data/pipeline-test/general/`, ya excluido de Git:

- archive: bytes originales exactos y manifiesto por SHA-256, creación exclusiva;
  mismo contenido no se sobrescribe, diferencia inesperada cancela.
- runs: informe de cada intento procesable con URL, fecha de recuperación, hash,
  derechos, índices al original, ausencias, exclusiones y cuarentena.
- data/radar.json: staging independiente, usando update() sin modificaciones,
  validación estricta, deduplicación, merge append-only y reemplazo atómico.

Se exigen HTTPS sin redirecciones, timeout de 30 s y máximo de 5 MB leído por
stream. HTTP fallido no se considera éxito. No hay reintentos automáticos.
Ejecutar un solo escritor a la vez, como requiere el actualizador existente.

Cada fila conserva `fuente` original e `ingestion` (agregador, SHA-256 original,
índice, derechos). `provenance` lo genera el actualizador para el documento
normalizado intermedio; ambos hashes tienen funciones distintas.
No se infiere publicación a partir del campo, ni muestra, ni identidad de estudio,
ni porcentajes ausentes. No se convierten ausencias en cero ni se funden coaliciones.
El proveedor debe entregar partidos normalizados según el esquema existente;
solo se normalizan instituto e ID mediante funciones ya disponibles.

Duplicados exactos por identidad se colapsan; resultados o ficha contradictorios
cancelan. Igual instituto y fechas de campo con IDs diferentes se bloquea como
posible sindicación, también entre ejecuciones. No se usa coincidencia ±4 días.
Alias de casas diferentes de CIS y estudios con fechas ligeramente distintas
requieren revisión manual: no se afirma detección completa de duplicados.

Se buscan registros desde publicación 2023-07-01. El validador existente exige
fin de campo >=2023-07-23: el intervalo previo se informa en cuarentena; no se
ha relajado el límite. CIS y publicaciones anteriores se excluyen. Ámbitos
territoriales, campos ausentes o inválidos se ponen en cuarentena. Si hay una
sola fila en cuarentena no se incorpora parcialmente el lote. Un conflicto
aborta conservando radar previo; el original ya archivado permite investigarlo.
Un fallo antes de generar informe puede dejar solo el archivo original.

`accepted` cuenta filas elegibles del lote, no altas nuevas. `duplicates` cuenta
repeticiones internas. `coverageComplete:false` siempre: ni firstFieldEnd ni
lastFieldEnd prueban continuidad. El resultado staged solo significa staging
sintácticamente válido, nunca autorización de publicación. No se conecta este
staging a sincronización, artefactos ni web.

## Comprobación

```
node --test test/radar.test.mjs test/radar-regressions.test.mjs test/validar-pipeline.test.mjs test/importar-general.test.mjs
```

Las 14 pruebas originales y 9 nuevas pasan (23/23). Las nuevas cubren derechos
antes de red, procedencia, normalización, duplicados, contradicciones, límites
temporales, ausencias, CIS, ámbito, HTTP, original exacto, idempotencia, conservación
append-only y lotes incompletos. La red se simula: no prueban cobertura de fuentes.
Usar la selección explícita o `test/*.test.mjs`, como el workflow. `node --test`
sin ruta descubre también dos scripts operativos llamados *-test.mjs e intenta
escribir en pipeline-test; no es una ejecución puramente unitaria.

Siguiente paso: desarrollar y contrastar una muestra Wikipedia con revisión
fijada y atribución; medir qué filas carecen de identidad estable, publicación,
campo y muestra. Habilitar Electográfica solo tras acreditar condiciones. Después
reconciliar fuentes y validar cobertura y pérdidas antes de integrar staging
con el pipeline existente. La mediana se implementará en un cambio posterior.
