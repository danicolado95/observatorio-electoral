# Reconciliación de encuestas

Regla aprobada: `electografica-sobre-wikipedia-v1`. Para la misma encuesta inequívocamente identificada prima Electográfica. No se infieren cifras ni se mapea FA a SUMAR; ausencia y cero se registran por separado.

Se exige una sola coincidencia, instituto, ámbito, tipo, publicación, inicio y fin del campo y muestra positiva coincidentes. El enlace original debe coincidir; si cambia, necesita un puente documental comprobable. Sigma Dos conserva el puente documental anterior, con los dos HTML originales y sus SHA256; ese puente no se extiende a otros estudios.

La evidencia contiene la entrada Blogger completa. La auditoría vuelve a extraer sus datos y hash con el mismo extractor del importador, y comprueba los registros completos, las diferencias y el motivo. El histórico existente conserva todos sus resultados y metadatos. Una revisión que contradiga ese histórico, una identidad ambigua, una fuente incompleta o contradictoria no autoriza la regla. Tampoco se reemplazan otras filas ya versionadas ni otra extracción del mismo lote: el candidato queda bloqueado en cuarentena para revisión. Los controles históricos y de referencias siguen vigentes y pueden bloquear la integración.

Las versiones se archivan en `quarantine.json` bajo `reconciliacion`, con decisión explícita; las reconciliaciones son resoluciones auditadas, no incidencias pendientes. Si la entrada deja el feed, su prueba íntegra pasa a `reconciliaciones_anteriores` y se verifica de nuevo. El informe manual enumera decisiones y diferencias. La cuarentena también conserva rechazos pendientes y exclusiones: no se debe interpretar su tamaño como número de fallos.

SocioMétrica 01/11/2026: la entrada íntegra de Electográfica muestra FA 4,9; Wikipedia 5,2 queda archivada. El Español publica 4,4 y se conserva su HTML en `evidencia-reconciliacion/sociometrica-elespanol.html`. No se afirma que las tres cifras sean revisiones equivalentes ni se suman FV/UPC para conciliarlas. La elección de 4,9 responde a la prioridad aprobada. La consulta web del 02/11/2026 confirmó de nuevo FA 4,9, campo 01/09–01/11 y muestra 4.893.

Sigma Dos 01/11/2026: FA 7,1; Wikipedia 7,5 queda archivada. La revisión del enlace de Electográfica conserva los resultados y se acredita con el expediente documental previo.

La regla automatiza la reconciliación local y la prueba manual existente. No activa publicación ni modifica cron. El éxito local no acredita todavía éxito remoto en Ubuntu/Node 22. Tras una única prueba manual satisfactoria y revisión de sus artefactos, la activación de cron en `main` requiere aprobación explícita y una revisión separada del destino del checkout y del job programado.
