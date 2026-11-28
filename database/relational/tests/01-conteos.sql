SELECT
  (SELECT count(*)::integer FROM usuario) AS usuario,
  (SELECT count(*)::integer FROM habilidad) AS habilidad,
  (SELECT count(*)::integer FROM simulacion) AS simulacion,
  (SELECT count(*)::integer FROM simulacion_habilidad) AS simulacion_habilidad,
  (SELECT count(*)::integer FROM intento) AS intento,
  (SELECT count(*)::integer FROM respuesta) AS respuesta,
  (SELECT count(*)::integer FROM evidencia) AS evidencia,
  (SELECT count(*)::integer FROM comparticion) AS comparticion,
  (SELECT count(*)::integer FROM evento_sincronizacion) AS evento_sincronizacion;
