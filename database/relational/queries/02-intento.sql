-- $1: intento, $2: dueño autenticado.
SELECT i.id_intento, i.estado, i.puntuacion, s.id_revision_publicada,
       r.id_respuesta, r.id_paso, r.id_opcion, r.secuencia
FROM intento i
JOIN simulacion s USING (id_simulacion)
LEFT JOIN respuesta r USING (id_intento)
WHERE i.id_intento = $1 AND i.id_usuario = $2
ORDER BY r.secuencia;
