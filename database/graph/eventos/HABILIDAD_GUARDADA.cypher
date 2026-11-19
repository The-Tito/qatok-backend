// =====================================================================
// QATO'K · evento HABILIDAD_GUARDADA (F1) · Parámetros: $id_habilidad,
// $nombre, $nivel_objetivo (entero o null). Crea o actualiza; un
// nivel_objetivo null quita la propiedad (B8: sin valor no se guarda).
// =====================================================================
MERGE (h:Habilidad {id_habilidad: $id_habilidad})
SET h.nombre = $nombre, h.nivel_objetivo = toInteger($nivel_objetivo);
