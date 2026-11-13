
# ==========================================
# ATLAS ELECTORAL
# 06. COMO SOMOS
# Paso 1: auditoria de variables
# ==========================================

library(haven)
library(dplyr)
library(here)

cis <- read_sav(
  here("datos-originales", "MD3582", "3582.sav")
)

# Variables que ya conocemos
variables <- c(
  "EDAD",
  "SEXO",
  "ESTUDIOS",
  "ESCIDEOL",
  "INGRESHOG"
)

stopifnot(all(variables %in% names(cis)))

# Comprobar las etiquetas y códigos originales
for (variable in variables) {
  
  cat("\n================================\n")
  cat("VARIABLE:", variable, "\n")
  
  cat(
    "Descripcion:",
    attr(cis[[variable]], "label"),
    "\n"
  )
  
  cat("\nCodigos:\n")
  print(attr(cis[[variable]], "labels"))
  
  cat("\nDistribucion sin ponderar:\n")
  print(
    table(
      as.numeric(cis[[variable]]),
      useNA = "ifany"
    )
  )
}

# Revisar la ponderacion
pesos <- as.numeric(cis$PESO)

stopifnot(
  length(pesos) == nrow(cis),
  all(is.finite(pesos)),
  all(pesos > 0)
)

cat("\nAUDITORIA INICIAL SUPERADA\n")
cat("Entrevistas:", nrow(cis), "\n")
cat("Variables inspeccionadas:", length(variables), "\n")


# ==========================================
# PASO 2. EDAD E IDEOLOGIA
# ==========================================

edad <- as.numeric(cis$EDAD)
ideologia <- as.numeric(cis$ESCIDEOL)
pesos <- as.numeric(cis$PESO)

# Crear grupos de edad
grupo_edad <- case_when(
  edad >= 18 & edad <= 24 ~ "18-24",
  edad >= 25 & edad <= 34 ~ "25-34",
  edad >= 35 & edad <= 44 ~ "35-44",
  edad >= 45 & edad <= 54 ~ "45-54",
  edad >= 55 & edad <= 64 ~ "55-64",
  edad >= 65 & edad < 999 ~ "65+",
  TRUE ~ NA_character_
)

# Solo posiciones ideologicas validas: 1-10
ideologia_valida <- ifelse(
  ideologia >= 1 & ideologia <= 10,
  ideologia,
  NA_real_
)

datos_cruce <- data.frame(
  edad = grupo_edad,
  ideologia = ideologia_valida,
  peso = pesos
)

# Distribucion ponderada de ideologia
# dentro de cada grupo de edad
cruce_edad_ideologia <- datos_cruce %>%
  filter(!is.na(edad), !is.na(ideologia)) %>%
  group_by(edad, ideologia) %>%
  summarise(
    n = n(),
    peso_total = sum(peso),
    .groups = "drop"
  ) %>%
  group_by(edad) %>%
  mutate(
    porcentaje = 100 * peso_total / sum(peso_total)
  ) %>%
  ungroup()

# Validar que cada grupo de edad suma 100%
validacion <- cruce_edad_ideologia %>%
  group_by(edad) %>%
  summarise(
    total = sum(porcentaje),
    .groups = "drop"
  )

stopifnot(
  all(abs(validacion$total - 100) < 1e-8)
)

cat("\nCRUCE EDAD-IDEOLOGIA VALIDADO\n")

# Media ideologica por grupo de edad
resumen_ideologia <- datos_cruce %>%
  filter(!is.na(edad), !is.na(ideologia)) %>%
  group_by(edad) %>%
  summarise(
    n = n(),
    media_ideologica = weighted.mean(
      ideologia,
      peso
    ),
    .groups = "drop"
  ) %>%
  mutate(
    media_ideologica = round(
      media_ideologica, 2
    )
  )

print(
  as.data.frame(resumen_ideologia),
  row.names = FALSE
)


# ==========================================
# PASO 3. INVERTIR EL CRUCE
# IDEOLOGIA -> EDAD
# ==========================================

cruce_ideologia_edad <- datos_cruce %>%
  filter(!is.na(edad), !is.na(ideologia)) %>%
  group_by(ideologia, edad) %>%
  summarise(
    n = n(),
    peso_total = sum(peso),
    .groups = "drop"
  ) %>%
  group_by(ideologia) %>%
  mutate(
    porcentaje = 100 * peso_total / sum(peso_total)
  ) %>%
  ungroup()

# Comprobar que cada posicion ideologica suma 100%
validacion_inversa <- cruce_ideologia_edad %>%
  group_by(ideologia) %>%
  summarise(
    total = sum(porcentaje),
    .groups = "drop"
  )

stopifnot(
  all(abs(validacion_inversa$total - 100) < 1e-8)
)

cat("\nCRUCE INVERSO VALIDADO\n")

# Resumen: porcentaje de menores de 35 años
# dentro de cada posicion ideologica
resumen_jovenes <- cruce_ideologia_edad %>%
  group_by(ideologia) %>%
  summarise(
    porcentaje_menores_35 = sum(
      porcentaje[edad %in% c("18-24", "25-34")]
    ),
    .groups = "drop"
  ) %>%
  mutate(
    porcentaje_menores_35 = round(
      porcentaje_menores_35, 1
    )
  )

print(
  as.data.frame(resumen_jovenes),
  row.names = FALSE
)


# ==========================================
# PASO 4. BASES MUESTRALES Y REFERENCIA
# ==========================================

datos_validos <- datos_cruce %>%
  filter(!is.na(edad), !is.na(ideologia))

# Porcentaje total de menores de 35 años
referencia_jovenes <- datos_validos %>%
  summarise(
    porcentaje = 100 * sum(
      peso[edad %in% c("18-24", "25-34")]
    ) / sum(peso)
  ) %>%
  pull(porcentaje)

cat("\n=== REFERENCIA GENERAL ===\n")
cat(
  "Menores de 35 años:",
  round(referencia_jovenes, 1),
  "%\n"
)

# Tamaño muestral y efectivo por posición
bases_ideologia <- datos_validos %>%
  group_by(ideologia) %>%
  summarise(
    n = n(),
    n_efectivo = sum(peso)^2 / sum(peso^2),
    .groups = "drop"
  ) %>%
  left_join(
    resumen_jovenes,
    by = "ideologia"
  ) %>%
  mutate(
    n_efectivo = round(n_efectivo, 1)
  )

stopifnot(
  sum(bases_ideologia$n) == nrow(datos_validos),
  all(bases_ideologia$n_efectivo > 0)
)

cat("\n=== BASES POR POSICION IDEOLOGICA ===\n")
print(
  as.data.frame(bases_ideologia),
  row.names = FALSE
)

# ==========================================
# PASO 5. AUDITORÍA DE NUEVAS DIMENSIONES
# ==========================================

nuevas_variables <- c(
  "SITLAB",
  "TAMUNI",
  "CLASESOCIAL",
  "CLASESUB"
)

stopifnot(all(nuevas_variables %in% names(cis)))

for (v in nuevas_variables) {
  
  cat("\n============================\n")
  cat("VARIABLE:", v, "\n")
  cat("DESCRIPCIÓN:", attr(cis[[v]], "label"), "\n")
  
  cat("\nCATEGORÍAS ORIGINALES:\n")
  print(attr(cis[[v]], "labels"))
  
  cat("\nFRECUENCIAS SIN PONDERAR:\n")
  print(
    table(
      as.numeric(cis[[v]]),
      useNA = "ifany"
    )
  )
}

cat("\nAUDITORÍA DE NUEVAS DIMENSIONES SUPERADA\n")


# ==========================================
# PASO 6. PREPARAR NUEVAS DIMENSIONES
# ==========================================

# Situacion laboral
sitlab <- as.numeric(cis$SITLAB)

grupo_laboral <- case_when(
  sitlab == 1 ~ "Trabaja",
  sitlab %in% c(2, 3) ~ "Jubilado/a o pensionista",
  sitlab %in% c(4, 5) ~ "En desempleo",
  sitlab == 6 ~ "Estudiante",
  sitlab == 7 ~ "Trabajo domestico no remunerado",
  sitlab == 8 ~ "Otra situacion",
  TRUE ~ NA_character_
)

# Tamano del municipio: mantener los 7 tramos
tamuni <- as.numeric(cis$TAMUNI)

grupo_municipio <- case_when(
  tamuni == 1 ~ "Hasta 2.000",
  tamuni == 2 ~ "2.001-10.000",
  tamuni == 3 ~ "10.001-50.000",
  tamuni == 4 ~ "50.001-100.000",
  tamuni == 5 ~ "100.001-400.000",
  tamuni == 6 ~ "400.001-1.000.000",
  tamuni == 7 ~ "Mas de 1.000.000",
  TRUE ~ NA_character_
)

# Clase social: clasificacion agrupada del CIS
clases <- as.numeric(cis$CLASESUB)

grupo_clase <- case_when(
  clases == 1 ~ "Alta y media-alta",
  clases == 2 ~ "Media-media",
  clases == 3 ~ "Media-baja",
  clases == 4 ~ "Trabajadora",
  clases == 5 ~ "Baja o pobre",
  clases == 6 ~ "Otras",
  TRUE ~ NA_character_
)

# Validaciones iniciales
stopifnot(
  length(grupo_laboral) == nrow(cis),
  length(grupo_municipio) == nrow(cis),
  length(grupo_clase) == nrow(cis),
  sum(!is.na(grupo_laboral)) == 5017,
  sum(!is.na(grupo_municipio)) == 5024,
  sum(!is.na(grupo_clase)) == 4925
)

cat("\nNUEVAS DIMENSIONES VALIDADAS\n")

cat("Situacion laboral:",
    sum(!is.na(grupo_laboral)), "casos validos\n")

cat("Municipio:",
    sum(!is.na(grupo_municipio)), "casos validos\n")

cat("Clase social:",
    sum(!is.na(grupo_clase)), "casos validos\n")


# ==========================================
# PASO 7. MOTOR GENERAL DE CRUCES
# ==========================================

library(tidyr)

calcular_cruce <- function(grupos, categorias) {
  
  stopifnot(
    length(grupos) == nrow(cis),
    length(categorias) == nrow(cis)
  )
  
  datos <- data.frame(
    grupo = as.character(grupos),
    categoria = as.character(categorias),
    peso = as.numeric(cis$PESO)
  ) %>%
    filter(
      !is.na(grupo),
      !is.na(categoria),
      is.finite(peso),
      peso > 0
    )
  
  # Base de cada grupo: solo casos validos
  # en ambas variables
  bases <- datos %>%
    group_by(grupo) %>%
    summarise(
      n_grupo = n(),
      peso_grupo = sum(peso),
      n_efectivo = sum(peso)^2 / sum(peso^2),
      .groups = "drop"
    )
  
  # Distribucion de categorias dentro de grupo
  resultado <- datos %>%
    group_by(grupo, categoria) %>%
    summarise(
      n_celda = n(),
      peso_celda = sum(peso),
      .groups = "drop"
    ) %>%
    complete(
      grupo,
      categoria,
      fill = list(
        n_celda = 0,
        peso_celda = 0
      )
    ) %>%
    left_join(bases, by = "grupo") %>%
    mutate(
      porcentaje = 100 * peso_celda / peso_grupo
    ) %>%
    arrange(grupo, categoria)
  
  # Comprobar que cada grupo suma 100%
  comprobacion <- resultado %>%
    group_by(grupo) %>%
    summarise(
      suma = sum(porcentaje),
      .groups = "drop"
    )
  
  stopifnot(
    all(abs(comprobacion$suma - 100) < 1e-8),
    all(is.finite(resultado$porcentaje)),
    all(resultado$porcentaje >= 0),
    all(resultado$porcentaje <= 100)
  )
  
  resultado
}

# ==========================================
# PRUEBA A. SITUACION LABORAL SEGUN EDAD
# ==========================================

laboral_por_edad <- calcular_cruce(
  grupo_edad,
  grupo_laboral
)

cat("\nCRUCE LABORAL POR EDAD VALIDADO\n")

# Ejemplo: personas de 18 a 24 años
laboral_por_edad %>%
  filter(grupo == "18-24") %>%
  select(
    grupo,
    categoria,
    porcentaje,
    n_grupo,
    n_efectivo
  ) %>%
  mutate(
    porcentaje = round(porcentaje, 1),
    n_efectivo = round(n_efectivo, 1)
  ) %>%
  as.data.frame() %>%
  print(row.names = FALSE)

# ==========================================
# PRUEBA B. EDAD SEGUN SITUACION LABORAL
# ==========================================

edad_por_laboral <- calcular_cruce(
  grupo_laboral,
  grupo_edad
)

cat("\nCRUCE INVERSO VALIDADO\n")

# Ejemplo: edades de las personas que trabajan
edad_por_laboral %>%
  filter(grupo == "Trabaja") %>%
  select(
    grupo,
    categoria,
    porcentaje,
    n_grupo,
    n_efectivo
  ) %>%
  mutate(
    porcentaje = round(porcentaje, 1),
    n_efectivo = round(n_efectivo, 1)
  ) %>%
  as.data.frame() %>%
  print(row.names = FALSE)


# ==========================================
# PASO 8. CATALOGO DE OCHO DIMENSIONES
# ==========================================

# Sexo
grupo_sexo <- case_when(
  as.numeric(cis$SEXO) == 1 ~ "Hombre",
  as.numeric(cis$SEXO) == 2 ~ "Mujer",
  TRUE ~ NA_character_
)

# Estudios
grupo_estudios <- case_when(
  as.numeric(cis$ESTUDIOS) == 1 ~ "Sin estudios",
  as.numeric(cis$ESTUDIOS) == 2 ~ "Primaria",
  as.numeric(cis$ESTUDIOS) == 3 ~ "Secundaria 1",
  as.numeric(cis$ESTUDIOS) == 4 ~ "Secundaria 2",
  as.numeric(cis$ESTUDIOS) == 5 ~ "FP",
  as.numeric(cis$ESTUDIOS) == 6 ~ "Superiores",
  as.numeric(cis$ESTUDIOS) == 7 ~ "Otros",
  TRUE ~ NA_character_
)

# Ideologia: conservar las diez posiciones
grupo_ideologia <- ifelse(
  !is.na(ideologia_valida),
  as.character(ideologia_valida),
  NA_character_
)

# Ingresos netos del hogar
grupo_ingresos <- case_when(
  as.numeric(cis$INGRESHOG) == 1 ~ "Mas de 5000",
  as.numeric(cis$INGRESHOG) == 2 ~ "3901-5000",
  as.numeric(cis$INGRESHOG) == 3 ~ "2701-3900",
  as.numeric(cis$INGRESHOG) == 4 ~ "1801-2700",
  as.numeric(cis$INGRESHOG) == 5 ~ "1100-1800",
  as.numeric(cis$INGRESHOG) == 6 ~ "Menos de 1100",
  TRUE ~ NA_character_
)

# Catálogo completo
dimensiones <- list(
  Edad = grupo_edad,
  Sexo = grupo_sexo,
  Estudios = grupo_estudios,
  Ideologia = grupo_ideologia,
  Ingresos = grupo_ingresos,
  Situacion_laboral = grupo_laboral,
  Municipio = grupo_municipio,
  Clase_social = grupo_clase
)

# Validar longitud de todas las variables
stopifnot(
  length(dimensiones) == 8,
  all(vapply(
    dimensiones,
    length,
    integer(1)
  ) == nrow(cis))
)

# Resumen de respuestas disponibles
resumen_dimensiones <- data.frame(
  dimension = names(dimensiones),
  casos_validos = vapply(
    dimensiones,
    function(x) sum(!is.na(x)),
    integer(1)
  )
)

resumen_dimensiones$casos_excluidos <-
  nrow(cis) - resumen_dimensiones$casos_validos

cat("\nOCHO DIMENSIONES VALIDADAS\n")

print(
  resumen_dimensiones,
  row.names = FALSE
)


# ==========================================
# PASO 9. GENERAR LOS 56 CRUCES
# ==========================================

# Todas las parejas dirigidas de dimensiones
parejas <- expand.grid(
  grupo = names(dimensiones),
  categoria = names(dimensiones),
  stringsAsFactors = FALSE
)

# Excluir cruces de una variable consigo misma
parejas <- parejas %>%
  filter(grupo != categoria)

stopifnot(nrow(parejas) == 56)

# Calcular todos los cruces
todos_los_cruces <- lapply(
  seq_len(nrow(parejas)),
  function(i) {
    
    variable_grupo <- parejas$grupo[i]
    variable_categoria <- parejas$categoria[i]
    
    resultado <- calcular_cruce(
      dimensiones[[variable_grupo]],
      dimensiones[[variable_categoria]]
    )
    
    resultado %>%
      mutate(
        dimension_grupo = variable_grupo,
        dimension_categoria = variable_categoria,
        .before = 1
      )
  }
)

# Unificar resultados
cruces_completos <- bind_rows(todos_los_cruces)

# Validaciones generales
stopifnot(
  nrow(parejas) == 56,
  all(is.finite(cruces_completos$porcentaje)),
  all(cruces_completos$porcentaje >= 0),
  all(cruces_completos$porcentaje <= 100),
  all(cruces_completos$n_grupo > 0),
  all(cruces_completos$n_efectivo > 0)
)

# Comprobar que cada grupo de cada cruce suma 100%
validacion_cruces <- cruces_completos %>%
  group_by(
    dimension_grupo,
    dimension_categoria,
    grupo
  ) %>%
  summarise(
    suma = sum(porcentaje),
    .groups = "drop"
  )

stopifnot(
  all(abs(validacion_cruces$suma - 100) < 1e-8)
)

cat("\n56 CRUCES VALIDADOS\n")

cat(
  "Comparaciones disponibles:",
  nrow(parejas), "\n"
)

cat(
  "Resultados calculados:",
  nrow(cruces_completos), "\n"
)

cat(
  "Grupos comprobados:",
  nrow(validacion_cruces), "\n"
)

# Mostrar el total de resultados por pareja
resumen_cruces <- cruces_completos %>%
  count(
    dimension_grupo,
    dimension_categoria,
    name = "resultados"
  )

print(
  as.data.frame(head(resumen_cruces, 12)),
  row.names = FALSE
)


# ==========================================
# PASO 10. REFERENCIAS GENERALES
# ==========================================

calcular_referencia <- function(nombre_grupo,
                                nombre_categoria) {
  
  datos <- data.frame(
    grupo = dimensiones[[nombre_grupo]],
    categoria = dimensiones[[nombre_categoria]],
    peso = as.numeric(cis$PESO)
  ) %>%
    filter(
      !is.na(grupo),
      !is.na(categoria),
      is.finite(peso),
      peso > 0
    )
  
  datos %>%
    group_by(categoria) %>%
    summarise(
      peso_categoria = sum(peso),
      .groups = "drop"
    ) %>%
    mutate(
      referencia_general =
        100 * peso_categoria / sum(peso_categoria),
      dimension_grupo = nombre_grupo,
      dimension_categoria = nombre_categoria,
      n_validos_cruce = nrow(datos),
      n_excluidos = nrow(cis) - nrow(datos)
    ) %>%
    select(
      dimension_grupo,
      dimension_categoria,
      categoria,
      referencia_general,
      n_validos_cruce,
      n_excluidos
    )
}

# Calcular referencias para las 56 parejas
referencias <- bind_rows(
  lapply(seq_len(nrow(parejas)), function(i) {
    calcular_referencia(
      parejas$grupo[i],
      parejas$categoria[i]
    )
  })
)

# Incorporarlas al motor de cruces
cruces_completos <- cruces_completos %>%
  left_join(
    referencias,
    by = c(
      "dimension_grupo",
      "dimension_categoria",
      "categoria"
    )
  )

# Verificar integridad
stopifnot(
  nrow(cruces_completos) == 2154,
  !anyNA(cruces_completos$referencia_general),
  all(cruces_completos$referencia_general >= 0),
  all(cruces_completos$referencia_general <= 100),
  all(cruces_completos$n_excluidos >= 0)
)

validacion_referencias <- referencias %>%
  group_by(
    dimension_grupo,
    dimension_categoria
  ) %>%
  summarise(
    total = sum(referencia_general),
    .groups = "drop"
  )

stopifnot(
  nrow(validacion_referencias) == 56,
  all(abs(validacion_referencias$total - 100) < 1e-8)
)

cat("\nREFERENCIAS GENERALES VALIDADAS\n")

# Ejemplo: clase social segun ingresos
cruces_completos %>%
  filter(
    dimension_grupo == "Ingresos",
    dimension_categoria == "Clase_social",
    grupo == "Menos de 1100"
  ) %>%
  transmute(
    clase_social = categoria,
    porcentaje_grupo = round(porcentaje, 1),
    referencia_espana = round(referencia_general, 1),
    diferencia_pp = round(
      porcentaje - referencia_general, 1
    ),
    n_grupo,
    n_excluidos
  ) %>%
  as.data.frame() %>%
  print(row.names = FALSE)


# ==========================================
# PASO 11. AUDITORIA DE CELDAS
# ==========================================

auditoria_celdas <- cruces_completos %>%
  mutate(
    nivel_informacion = case_when(
      n_grupo < 30 | n_efectivo < 30 ~
        "Grupo muy pequeno",
      n_celda == 0 ~
        "Sin casos observados",
      n_celda < 10 ~
        "Celda muy pequena",
      n_celda < 30 | n_efectivo < 100 ~
        "Interpretar con cautela",
      TRUE ~ "Informacion suficiente"
    )
  )

cat("\n=== AUDITORIA DE CELDAS ===\n")

auditoria_celdas %>%
  count(nivel_informacion) %>%
  as.data.frame() %>%
  print(row.names = FALSE)

# Comprobar integridad
stopifnot(
  nrow(auditoria_celdas) == 2154,
  all(auditoria_celdas$n_celda >= 0),
  all(auditoria_celdas$n_celda <=
        auditoria_celdas$n_grupo),
  !anyNA(auditoria_celdas$nivel_informacion)
)

cat("\nAUDITORIA DE CELDAS VALIDADA\n")


# ==========================================
# PASO 12. EXPORTAR COMPARADOR SOCIAL
# ==========================================

library(jsonlite)

# Distribuciones generales de las 8 dimensiones
distribuciones_generales <- dplyr::bind_rows(
  lapply(names(dimensiones), function(nombre) {
    
    datos <- data.frame(
      categoria = dimensiones[[nombre]],
      peso = as.numeric(cis$PESO)
    ) %>%
      filter(!is.na(categoria), is.finite(peso), peso > 0)
    
    total_peso <- sum(datos$peso)
    
    datos %>%
      group_by(categoria) %>%
      summarise(
        n = n(),
        peso_categoria = sum(peso),
        .groups = "drop"
      ) %>%
      mutate(
        dimension = nombre,
        porcentaje = 100 * peso_categoria / total_peso,
        n_validos = nrow(datos),
        n_excluidos = nrow(cis) - nrow(datos),
        .before = 1
      )
  })
)

# Incluir las advertencias auditadas
cruces_exportar <- auditoria_celdas

# Comprobaciones previas
stopifnot(
  length(dimensiones) == 8,
  nrow(parejas) == 56,
  nrow(cruces_exportar) == 2154,
  all(is.finite(distribuciones_generales$porcentaje)),
  all(is.finite(cruces_exportar$referencia_general)),
  !anyNA(cruces_exportar$nivel_informacion)
)

# Información sobre el origen y los cálculos
salida_social <- list(
  metadata = list(
    fuente = "CIS",
    estudio = 3582,
    entrevistas = nrow(cis),
    ponderacion = "PESO",
    dimensiones = names(dimensiones),
    cruces = nrow(parejas),
    metodologia = paste(
      "Porcentajes ponderados.",
      "Los cruces incluyen solo personas con",
      "respuesta valida en ambas dimensiones.",
      "Cada porcentaje se calcula dentro del grupo.",
      "Las referencias generales usan el mismo",
      "universo valido que cada cruce.",
      "Las advertencias son orientativas."
    )
  ),
  distribuciones_generales = distribuciones_generales,
  cruces = cruces_exportar
)

# Crear archivo
ruta_social <- here::here(
  "resultados",
  "electorado_social_3582.json"
)

dir.create(
  dirname(ruta_social),
  recursive = TRUE,
  showWarnings = FALSE
)

jsonlite::write_json(
  salida_social,
  path = ruta_social,
  pretty = TRUE,
  auto_unbox = TRUE,
  dataframe = "rows",
  na = "null",
  digits = NA
)

# Volver a leer y comprobar
verificacion_social <- jsonlite::read_json(
  ruta_social,
  simplifyVector = TRUE
)

stopifnot(
  nrow(verificacion_social$cruces) == 2154,
  all(verificacion_social$cruces$porcentaje >= 0),
  all(verificacion_social$cruces$porcentaje <= 100),
  length(unique(
    verificacion_social$distribuciones_generales$dimension
  )) == 8
)

cat("\nJSON SOCIAL VALIDADO\n")
cat("Dimensiones:", length(dimensiones), "\n")
cat("Cruces:", nrow(parejas), "\n")
cat("Resultados:", nrow(verificacion_social$cruces), "\n")
cat("Archivo:", ruta_social, "\n")
