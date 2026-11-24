-- Cada caso usa una subtransacción y falla si la BD acepta la operación.
DO $$
DECLARE
  registro record;
  fallo text;
BEGIN
  FOR registro IN SELECT * FROM (VALUES
    ('correo duplicado', '23505', 'uq_usuario_correo',
      'INSERT INTO usuario SELECT gen_random_uuid(), nombre, upper(correo), contrasena_hash,
         rol, estado, fecha_registro FROM usuario LIMIT 1'),
    ('simulación con historial', '23503', 'fk_intento_simulacion',
      'DELETE FROM simulacion WHERE id_simulacion = (SELECT id_simulacion FROM intento LIMIT 1)'),
    ('habilidad en uso', '23503', 'fk_simulacion_habilidad_habilidad',
      'DELETE FROM habilidad WHERE id_habilidad = (SELECT id_habilidad FROM simulacion_habilidad LIMIT 1)'),
    ('publicación sin revisión', '23514', 'ck_simulacion_revision_publicada',
      'UPDATE simulacion SET id_revision_publicada = NULL WHERE estado = ''PUBLICADA'''),
    ('dos intentos abiertos', '23505', 'uq_intento_en_curso',
      'INSERT INTO intento (id_intento, id_usuario, id_simulacion, fecha_inicio, estado)
       SELECT gen_random_uuid(), id_usuario, id_simulacion, fecha_inicio, estado
       FROM intento WHERE estado = ''EN_CURSO'''),
    ('cierre sin fecha', '23514', 'ck_intento_fecha_fin',
      'UPDATE intento SET fecha_fin = NULL WHERE estado = ''COMPLETADO'''),
    ('puntuación fuera de rango', '23514', 'ck_intento_puntuacion',
      'UPDATE intento SET puntuacion = 101 WHERE estado = ''COMPLETADO'''),
    ('secuencia duplicada', '23505', 'uq_respuesta_intento_secuencia',
      'INSERT INTO respuesta SELECT gen_random_uuid(), id_intento, id_paso, id_opcion,
         fecha_respuesta, secuencia FROM respuesta LIMIT 1'),
    ('evidencia de intento ajeno', '23503', 'fk_evidencia_intento_dueno',
      'UPDATE evidencia e SET id_usuario = (SELECT id_usuario FROM usuario u WHERE u.id_usuario <> e.id_usuario LIMIT 1)'),
    ('segunda evidencia del intento', '23505', 'uq_evidencia_intento',
      'INSERT INTO evidencia SELECT gen_random_uuid(), id_intento, id_usuario, titulo,
         fecha_generacion, visibilidad FROM evidencia LIMIT 1'),
    ('token duplicado', '23505', 'uq_comparticion_token',
      'INSERT INTO comparticion SELECT gen_random_uuid(), id_evidencia, token,
         fecha_creacion, estado, fecha_expiracion, destinatario FROM comparticion LIMIT 1'),
    ('vencimiento inválido', '23514', 'ck_comparticion_vigencia',
      'UPDATE comparticion SET fecha_expiracion = fecha_creacion'),
    ('evento aplicado sin fecha', '23514', 'ck_evento_aplicado_en',
      'INSERT INTO evento_sincronizacion (id_evento, tipo, id_entidad, payload, estado)
       VALUES (gen_random_uuid(), ''USUARIO_CREADO'', gen_random_uuid(), ''{}'', ''APLICADO'')')
  ) AS casos(nombre, codigo, restriccion, comando)
  LOOP
    BEGIN
      EXECUTE registro.comando;
      RAISE EXCEPTION 'Se aceptó la operación inválida: %', registro.nombre;
    EXCEPTION
      WHEN integrity_constraint_violation THEN
        GET STACKED DIAGNOSTICS fallo = CONSTRAINT_NAME;
        IF SQLSTATE <> registro.codigo OR fallo <> registro.restriccion THEN
          RAISE;
        END IF;
    END;
  END LOOP;
END $$;
