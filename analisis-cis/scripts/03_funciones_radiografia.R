
# ATLAS ELECTORAL
# 03 - Motor estadístico de radiografías
# Fuente: microdatos del CIS

library(dplyr)
library(tidyr)

# ==========================================
# 1. DISTRIBUCIONES POR CATEGORÍAS
# ==========================================

calcular_radiografia <- function(datos, variable,
                                 categorias = NULL) {
  
  stopifnot(
    variable %in% names(datos),
    all(c("partido", "peso") %in% names(datos))
  )
  
  # Preparar respuestas válidas
  base <- datos %>%
    transmute(
      partido = as.character(partido),
      categoria = as.character(.data[[variable]]),
      peso = as.numeric(peso)
    ) %>%
    filter(
      !is.na(categoria),
      !is.na(peso),
      is.finite(peso),
      peso > 0
    )
  
  # Determinar categorías y orden
  if (is.null(categorias)) {
    categorias <- unique(base$categoria)
    
    # Orden numérico si todas las categorías lo permiten
    numeros <- suppressWarnings(as.numeric(categorias))
    
    if (all(!is.na(numeros))) {
      categorias <- categorias[order(numeros)]
    } else {
      categorias <- sort(categorias)
    }
  }
  
  categorias <- as.character(categorias)
  
  stopifnot(
    length(categorias) > 0,
    !anyNA(categorias),
    !anyDuplicated(categorias)
  )
  
  if (!all(base$categoria %in% categorias)) {
    stop("Hay categorías sin definir en la variable.")
  }
  
  # Añadir referencia general
  general <- base %>%
    mutate(partido = "Electorado general")
  
  base <- bind_rows(
    base %>% filter(!is.na(partido)),
    general
  )
  
  # Tamaños muestrales
  muestras <- base %>%
    group_by(partido) %>%
    summarise(
      n_total = n(),
      peso_total = sum(peso),
      n_efectivo = sum(peso)^2 / sum(peso^2),
      .groups = "drop"
    )
  
  # Frecuencias observadas
  frecuencias <- base %>%
    group_by(partido, categoria) %>%
    summarise(
      n = n(),
      peso_categoria = sum(peso),
      .groups = "drop"
    )
  
  # Crear todas las combinaciones,
  # incluso las que tienen 0 observaciones
  estructura <- expand.grid(
    partido = muestras$partido,
    categoria = categorias,
    stringsAsFactors = FALSE
  )
  
  resultado <- estructura %>%
    left_join(
      frecuencias,
      by = c("partido", "categoria")
    ) %>%
    mutate(
      n = replace_na(n, 0L),
      peso_categoria = replace_na(peso_categoria, 0)
    ) %>%
    left_join(muestras, by = "partido") %>%
    mutate(
      porcentaje = round(
        100 * peso_categoria / peso_total, 2
      ),
      categoria = factor(
        categoria,
        levels = categorias,
        ordered = TRUE
      )
    ) %>%
    arrange(partido, categoria) %>%
    mutate(
      categoria = as.character(categoria),
      n_efectivo = round(n_efectivo, 1)
    ) %>%
    select(
      partido, categoria, porcentaje,
      n, n_total, n_efectivo
    )
  
  return(resultado)
}


# ==========================================
# 2. MEDIAS PONDERADAS
# ==========================================

calcular_media_ponderada <- function(
    datos, variable, minimo = -Inf, maximo = Inf) {
  
  stopifnot(
    variable %in% names(datos),
    all(c("partido", "peso") %in% names(datos))
  )
  
  base <- datos %>%
    transmute(
      partido = as.character(partido),
      valor = suppressWarnings(
        as.numeric(as.character(.data[[variable]]))
      ),
      peso = as.numeric(peso)
    ) %>%
    filter(
      !is.na(valor),
      is.finite(valor),
      valor >= minimo,
      valor <= maximo,
      !is.na(peso),
      is.finite(peso),
      peso > 0
    )
  
  general <- base %>%
    mutate(partido = "Electorado general")
  
  base <- bind_rows(
    base %>% filter(!is.na(partido)),
    general
  )
  
  resultado <- base %>%
    group_by(partido) %>%
    summarise(
      n = n(),
      media = round(weighted.mean(valor, peso), 2),
      n_efectivo = round(
        sum(peso)^2 / sum(peso^2), 1
      ),
      .groups = "drop"
    ) %>%
    arrange(media)
  
  return(resultado)
}
