
# ==============================================
# ATLAS ELECTORAL
# 04 - Preocupaciones del electorado
# CIS 3582 - Octubre de 2026
# ==============================================

library(haven)
library(dplyr)
library(here)

# 1. Importar microdatos
cis <- read_sav(
  here("datos-originales", "MD3582", "3582.sav")
)

# 2. Variables de respuesta múltiple
variables_problemas <- c(
  "PESPANNA1",
  "PESPANNA2",
  "PESPANNA3"
)

problemas <- sapply(
  variables_problemas,
  function(v) as.numeric(cis[[v]])
)

pesos <- as.numeric(cis$PESO)

stopifnot(
  nrow(problemas) == nrow(cis),
  all(is.finite(pesos)),
  all(pesos > 0)
)

# 3. Cinco problemas principales
codigos_top5 <- c(7, 18, 8, 9, 24)

nombres_top5 <- c(
  "Vivienda",
  "Inmigración",
  "Problemas económicos",
  "Calidad del empleo",
  "Gobierno y políticos concretos"
)

# 4. Clasificar a las personas entrevistadas
edad <- as.numeric(cis$EDAD)
sexo <- as.numeric(cis$SEXO)

grupo_edad <- case_when(
  edad >= 18 & edad <= 24 ~ "18-24",
  edad >= 25 & edad <= 34 ~ "25-34",
  edad >= 35 & edad <= 44 ~ "35-44",
  edad >= 45 & edad <= 54 ~ "45-54",
  edad >= 55 & edad <= 64 ~ "55-64",
  edad >= 65 & edad < 999 ~ "65+",
  TRUE ~ NA_character_
)

grupo_sexo <- case_when(
  sexo == 1 ~ "Hombre",
  sexo == 2 ~ "Mujer",
  TRUE ~ NA_character_
)

# 5. Función para calcular preocupaciones por grupo
calcular_preocupacion_grupos <- function(
    grupos, dimension, categorias
) {
  
  resultados <- list()
  
  for (grupo in categorias) {
    
    seleccion <- !is.na(grupos) & grupos == grupo
    
    pesos_grupo <- pesos[seleccion]
    
    n <- sum(seleccion)
    
    n_efectivo <- sum(pesos_grupo)^2 /
      sum(pesos_grupo^2)
    
    for (i in seq_along(codigos_top5)) {
      
      codigo <- codigos_top5[i]
      
      # Una persona cuenta una sola vez
      menciona <- rowSums(
        problemas == codigo,
        na.rm = TRUE
      ) > 0
      
      porcentaje <- 100 *
        sum(pesos[seleccion & menciona]) /
        sum(pesos_grupo)
      
      resultados[[length(resultados) + 1]] <-
        data.frame(
          dimension = dimension,
          grupo = grupo,
          codigo = codigo,
          problema = nombres_top5[i],
          porcentaje = porcentaje,
          n = n,
          n_efectivo = n_efectivo
        )
    }
  }
  
  bind_rows(resultados)
}

# 6. Calcular por edad
preocupaciones_edad <- calcular_preocupacion_grupos(
  grupo_edad,
  "Edad",
  c("18-24", "25-34", "35-44",
    "45-54", "55-64", "65+")
)

# 7. Calcular por sexo
preocupaciones_sexo <- calcular_preocupacion_grupos(
  grupo_sexo,
  "Sexo",
  c("Hombre", "Mujer")
)

# 8. Unificar resultados
comparaciones <- bind_rows(
  preocupaciones_edad,
  preocupaciones_sexo
)

# 9. Validaciones
stopifnot(
  nrow(comparaciones) == 40,
  all(is.finite(comparaciones$porcentaje)),
  all(comparaciones$porcentaje >= 0),
  all(comparaciones$porcentaje <= 100),
  all(comparaciones$n > 0),
  all(comparaciones$n_efectivo > 0)
)

cat("VALIDACIÓN SUPERADA: 40 comparaciones.\n")

# 10. Mostrar vivienda por edad
cat("\n=== VIVIENDA POR EDAD ===\n")

tabla_edad <- comparaciones %>%
  filter(
    problema == "Vivienda",
    dimension == "Edad"
  ) %>%
  mutate(porcentaje = round(porcentaje, 1))

print(as.data.frame(tabla_edad), row.names = FALSE)


# 11. Mostrar vivienda por sexo
cat("\n=== VIVIENDA POR SEXO ===\n")

tabla_sexo <- comparaciones %>%
  filter(
    problema == "Vivienda",
    dimension == "Sexo"
  ) %>%
  mutate(porcentaje = round(porcentaje, 1))

print(as.data.frame(tabla_sexo), row.names = FALSE)


# ==============================================
# 12. IDEOLOGÍA Y PARTIDOS
# ==============================================

# Escala ideológica original del CIS: 1 a 10
ideologia_num <- as.numeric(cis$ESCIDEOL)

grupo_ideologia <- ifelse(
  !is.na(ideologia_num) &
    ideologia_num >= 1 &
    ideologia_num <= 10,
  as.character(ideologia_num),
  NA_character_
)

# Intención directa de voto, variable recodificada
voto_num <- as.numeric(cis$INTENCIONGR)

grupo_partido <- case_when(
  voto_num == 1  ~ "PSOE",
  voto_num == 2  ~ "PP",
  voto_num == 3  ~ "VOX",
  voto_num == 8  ~ "Podemos",
  voto_num == 21 ~ "SUMAR / Frente Amplio",
  voto_num == 28 ~ "SALF",
  TRUE ~ NA_character_
)

# Calcular las cinco preocupaciones iniciales
preocupaciones_ideologia <- calcular_preocupacion_grupos(
  grupo_ideologia,
  "Ideología",
  as.character(1:10)
)

preocupaciones_partido <- calcular_preocupacion_grupos(
  grupo_partido,
  "Partido",
  c(
    "PSOE",
    "PP",
    "VOX",
    "SUMAR / Frente Amplio",
    "Podemos",
    "SALF"
  )
)

# Unificar con edad y sexo
comparaciones <- bind_rows(
  preocupaciones_edad,
  preocupaciones_sexo,
  preocupaciones_ideologia,
  preocupaciones_partido
)

# Comprobar la estructura
stopifnot(
  nrow(comparaciones) == 120,
  all(is.finite(comparaciones$porcentaje)),
  all(comparaciones$porcentaje >= 0),
  all(comparaciones$porcentaje <= 100),
  all(comparaciones$n_efectivo > 0)
)

cat("\nVALIDACIÓN SUPERADA: 120 comparaciones.\n")

# Vivienda según ideología
cat("\n=== VIVIENDA POR IDEOLOGÍA ===\n")

comparaciones %>%
  filter(
    problema == "Vivienda",
    dimension == "Ideología"
  ) %>%
  select(grupo, porcentaje, n, n_efectivo) %>%
  mutate(
    porcentaje = round(porcentaje, 1),
    n_efectivo = round(n_efectivo, 1)
  ) %>%
  as.data.frame() %>%
  print(row.names = FALSE)

# Vivienda según partido
cat("\n=== VIVIENDA POR PARTIDO ===\n")

comparaciones %>%
  filter(
    problema == "Vivienda",
    dimension == "Partido"
  ) %>%
  select(grupo, porcentaje, n, n_efectivo) %>%
  mutate(
    porcentaje = round(porcentaje, 1),
    n_efectivo = round(n_efectivo, 1)
  ) %>%
  as.data.frame() %>%
  print(row.names = FALSE)


# ==============================================
# 13. ESTUDIOS E INGRESOS DEL HOGAR
# ==============================================

grupo_estudios <- case_when(
  as.numeric(cis$ESTUDIOS) == 1 ~ "Sin estudios",
  as.numeric(cis$ESTUDIOS) == 2 ~ "Primaria",
  as.numeric(cis$ESTUDIOS) == 3 ~ "Secundaria 1ª etapa",
  as.numeric(cis$ESTUDIOS) == 4 ~ "Secundaria 2ª etapa",
  as.numeric(cis$ESTUDIOS) == 5 ~ "Formación Profesional",
  as.numeric(cis$ESTUDIOS) == 6 ~ "Estudios superiores",
  as.numeric(cis$ESTUDIOS) == 7 ~ "Otros",
  TRUE ~ NA_character_
)

grupo_ingresos <- case_when(
  as.numeric(cis$INGRESHOG) == 6 ~ "Menos de 1.100 €",
  as.numeric(cis$INGRESHOG) == 5 ~ "1.100-1.800 €",
  as.numeric(cis$INGRESHOG) == 4 ~ "1.801-2.700 €",
  as.numeric(cis$INGRESHOG) == 3 ~ "2.701-3.900 €",
  as.numeric(cis$INGRESHOG) == 2 ~ "3.901-5.000 €",
  as.numeric(cis$INGRESHOG) == 1 ~ "Más de 5.000 €",
  TRUE ~ NA_character_
)

preocupaciones_estudios <- calcular_preocupacion_grupos(
  grupo_estudios,
  "Estudios",
  c(
    "Sin estudios",
    "Primaria",
    "Secundaria 1ª etapa",
    "Secundaria 2ª etapa",
    "Formación Profesional",
    "Estudios superiores",
    "Otros"
  )
)

preocupaciones_ingresos <- calcular_preocupacion_grupos(
  grupo_ingresos,
  "Ingresos del hogar",
  c(
    "Menos de 1.100 €",
    "1.100-1.800 €",
    "1.801-2.700 €",
    "2.701-3.900 €",
    "3.901-5.000 €",
    "Más de 5.000 €"
  )
)

comparaciones <- bind_rows(
  preocupaciones_edad,
  preocupaciones_sexo,
  preocupaciones_ideologia,
  preocupaciones_partido,
  preocupaciones_estudios,
  preocupaciones_ingresos
)

stopifnot(
  nrow(comparaciones) == 185,
  all(is.finite(comparaciones$porcentaje)),
  all(comparaciones$porcentaje >= 0),
  all(comparaciones$porcentaje <= 100),
  all(comparaciones$n > 0),
  all(comparaciones$n_efectivo > 0)
)

cat("\nVALIDACIÓN SUPERADA: 185 comparaciones.\n")

# Mostrar la vivienda según los dos grupos nuevos
comparaciones %>%
  filter(
    problema == "Vivienda",
    dimension %in% c("Estudios", "Ingresos del hogar")
  ) %>%
  select(dimension, grupo, porcentaje, n, n_efectivo) %>%
  mutate(
    porcentaje = round(porcentaje, 1),
    n_efectivo = round(n_efectivo, 1)
  ) %>%
  as.data.frame() %>%
  print(row.names = FALSE)


# ==============================================
# 14. CATÁLOGO COMPLETO DE PREOCUPACIONES
# ==============================================

# Obtener todos los códigos que aparecen en
# las tres respuestas sobre problemas de España
codigos_top5 <- sort(unique(as.numeric(problemas)))

# Excluir valores ausentes y respuestas especiales
codigos_top5 <- codigos_top5[
  !is.na(codigos_top5) &
    !codigos_top5 %in% c(996, 997, 998, 999)
]

# Recuperar los nombres originales del CIS
etiquetas_problemas <- attr(
  cis$PESPANNA1, "labels"
)

nombres_top5 <- names(etiquetas_problemas)[
  match(
    codigos_top5,
    as.numeric(etiquetas_problemas)
  )
]

stopifnot(
  length(codigos_top5) == length(nombres_top5),
  !anyNA(nombres_top5)
)

# Reutilizar nuestra función para las seis dimensiones
catalogo_completo <- bind_rows(
  calcular_preocupacion_grupos(
    grupo_edad, "Edad",
    c("18-24", "25-34", "35-44",
      "45-54", "55-64", "65+")
  ),
  calcular_preocupacion_grupos(
    grupo_sexo, "Sexo",
    c("Hombre", "Mujer")
  ),
  calcular_preocupacion_grupos(
    grupo_ideologia, "Ideología",
    as.character(1:10)
  ),
  calcular_preocupacion_grupos(
    grupo_partido, "Partido",
    c("PSOE", "PP", "VOX",
      "SUMAR / Frente Amplio",
      "Podemos", "SALF")
  ),
  calcular_preocupacion_grupos(
    grupo_estudios, "Estudios",
    c("Sin estudios", "Primaria",
      "Secundaria 1ª etapa",
      "Secundaria 2ª etapa",
      "Formación Profesional",
      "Estudios superiores", "Otros")
  ),
  calcular_preocupacion_grupos(
    grupo_ingresos, "Ingresos del hogar",
    c("Menos de 1.100 €", "1.100-1.800 €",
      "1.801-2.700 €", "2.701-3.900 €",
      "3.901-5.000 €", "Más de 5.000 €")
  )
)

# Validaciones del catálogo
stopifnot(
  nrow(catalogo_completo) ==
    length(codigos_top5) * 37,
  all(is.finite(catalogo_completo$porcentaje)),
  all(catalogo_completo$porcentaje >= 0),
  all(catalogo_completo$porcentaje <= 100),
  all(catalogo_completo$n_efectivo > 0)
)

cat("\nCATÁLOGO COMPLETO VALIDADO\n")
cat("Problemas disponibles:",
    length(codigos_top5), "\n")
cat("Dimensiones: 6\n")
cat("Comparaciones:",
    nrow(catalogo_completo), "\n")

# Comprobar un tema fuera del top cinco
catalogo_completo %>%
  filter(
    problema == "La sanidad",
    dimension == "Edad"
  ) %>%
  select(grupo, porcentaje, n, n_efectivo) %>%
  mutate(
    porcentaje = round(porcentaje, 1),
    n_efectivo = round(n_efectivo, 1)
  ) %>%
  as.data.frame() %>%
  print(row.names = FALSE)


# ==============================================
# 15. RANKING NACIONAL COMPLETO
# ==============================================

# Reconstruir la auditoría desde las tres respuestas originales del CIS.
# Contar personas (sin ponderar), una sola vez por problema, igual que
# menciones_grupo; los porcentajes se ponderan con PESO más abajo.
auditoria_problemas <- data.frame(
  codigo = codigos_top5,
  problema = nombres_top5,
  menciones = vapply(
    codigos_top5,
    function(codigo) {
      as.integer(sum(rowSums(problemas == codigo, na.rm = TRUE) > 0))
    },
    integer(1)
  )
)

stopifnot(
  nrow(auditoria_problemas) == 69,
  !anyDuplicated(auditoria_problemas$codigo),
  all(auditoria_problemas$menciones > 0),
  all(auditoria_problemas$menciones <= nrow(cis))
)

ranking_nacional <- auditoria_problemas %>%
  rowwise() %>%
  mutate(
    porcentaje = {
      menciona <- rowSums(
        problemas == codigo,
        na.rm = TRUE
      ) > 0
      
      100 * sum(pesos[menciona]) / sum(pesos)
    }
  ) %>%
  ungroup() %>%
  mutate(
    nivel_informacion = case_when(
      menciones >= 100 ~ "Amplia",
      menciones >= 30 ~ "Moderada",
      TRUE ~ "Escasa"
    )
  ) %>%
  arrange(desc(porcentaje))

# Validaciones
stopifnot(
  nrow(ranking_nacional) == 69,
  all(is.finite(ranking_nacional$porcentaje)),
  all(ranking_nacional$porcentaje >= 0),
  all(ranking_nacional$porcentaje <= 100),
  sum(ranking_nacional$menciones < 30) == 30
)

cat("\nRANKING NACIONAL VALIDADO\n")

print(
  as.data.frame(
    ranking_nacional %>%
      slice_head(n = 15) %>%
      mutate(porcentaje = round(porcentaje, 1))
  ),
  row.names = FALSE
)

# ==========================================
# 16. AUDITORÍA DE MENCIONES POR GRUPO
# ==========================================

grupos_por_dimension <- list(
  "Edad" = grupo_edad,
  "Sexo" = grupo_sexo,
  "Ideología" = grupo_ideologia,
  "Partido" = grupo_partido,
  "Estudios" = grupo_estudios,
  "Ingresos del hogar" = grupo_ingresos
)

catalogo_completo$menciones_grupo <- vapply(
  seq_len(nrow(catalogo_completo)),
  function(i) {
    
    fila <- catalogo_completo[i, ]
    
    grupos <- grupos_por_dimension[[fila$dimension]]
    
    seleccion <- !is.na(grupos) &
      grupos == fila$grupo
    
    menciona <- rowSums(
      problemas == fila$codigo,
      na.rm = TRUE
    ) > 0
    
    as.integer(sum(seleccion & menciona))
  },
  integer(1)
)

stopifnot(
  nrow(catalogo_completo) == 2553,
  all(catalogo_completo$menciones_grupo >= 0),
  all(catalogo_completo$menciones_grupo <= catalogo_completo$n)
)

cat("\nAUDITORÍA DE MENCIONES SUPERADA\n")

# ==========================================
# 17. EXPORTAR ELECTORADO A JSON
# ==========================================

library(jsonlite)

# Añadir las menciones nacionales a las comparaciones
catalogo_exportar <- catalogo_completo %>%
  left_join(
    ranking_nacional %>%
      select(
        codigo,
        menciones_nacionales = menciones
      ),
    by = "codigo"
  )

# Validaciones previas
stopifnot(
  nrow(catalogo_exportar) == 2553,
  !anyNA(catalogo_exportar$menciones_nacionales),
  all(catalogo_exportar$menciones_grupo >= 0)
)

# Preparar el archivo
salida_electorado <- list(
  metadata = list(
    fuente = "CIS",
    estudio = 3582,
    periodo = "Octubre de 2026",
    ponderacion = "PESO",
    entrevistas = nrow(cis),
    pregunta = "Principales problemas de España",
    variables_originales = variables_problemas,
    nota = paste(
      "Cada entrevistado cuenta una sola vez por problema.",
      "Porcentajes ponderados sobre el total del grupo.",
      "Las respuestas multiples pueden sumar mas del 100%."
    )
  ),
  
  ranking_nacional = ranking_nacional,
  comparaciones = catalogo_exportar
)

# Ruta de salida
ruta_json <- here::here(
  "resultados",
  "electorado_3582.json"
)

dir.create(
  dirname(ruta_json),
  recursive = TRUE,
  showWarnings = FALSE
)

# Exportar
jsonlite::write_json(
  salida_electorado,
  path = ruta_json,
  pretty = TRUE,
  auto_unbox = TRUE,
  dataframe = "rows",
  na = "null",
  digits = NA
)

# Comprobar el archivo generado
json_comprobacion <- jsonlite::read_json(
  ruta_json,
  simplifyVector = TRUE
)

stopifnot(
  nrow(json_comprobacion$ranking_nacional) == 69,
  nrow(json_comprobacion$comparaciones) == 2553,
  all(json_comprobacion$comparaciones$porcentaje >= 0),
  all(json_comprobacion$comparaciones$porcentaje <= 100)
)

cat("\nJSON ELECTORADO VALIDADO\n")
cat("Problemas:", nrow(json_comprobacion$ranking_nacional), "\n")
cat("Comparaciones:", nrow(json_comprobacion$comparaciones), "\n")
cat("Archivo:", ruta_json, "\n")


