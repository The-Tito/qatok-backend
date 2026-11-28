DO $$
DECLARE
  objetivo intento%ROWTYPE;
  ejemplo respuesta%ROWTYPE;
  id_nueva_respuesta uuid := gen_random_uuid();
  id_nuevo_evento uuid := gen_random_uuid();
  primero evento_sincronizacion%ROWTYPE;
  segundo evento_sincronizacion%ROWTYPE;
  restriccion text;
BEGIN
  SELECT * INTO STRICT objetivo FROM intento WHERE estado = 'EN_CURSO';
  SELECT r.* INTO STRICT ejemplo
  FROM respuesta r
  JOIN intento i USING (id_intento)
  WHERE i.id_simulacion = objetivo.id_simulacion
  ORDER BY r.secuencia DESC LIMIT 1;

  BEGIN
    INSERT INTO respuesta VALUES (
      id_nueva_respuesta, objetivo.id_intento, ejemplo.id_paso, ejemplo.id_opcion, now(),
      (SELECT coalesce(max(secuencia), 0) + 1 FROM respuesta WHERE id_intento = objetivo.id_intento)
    );
    UPDATE intento SET estado = 'COMPLETADO', puntuacion = 75, fecha_fin = now()
    WHERE id_intento = objetivo.id_intento;
    INSERT INTO evento_sincronizacion (id_evento, tipo, id_entidad, payload)
    VALUES (id_nuevo_evento, 'RESPUESTA_REGISTRADA', id_nueva_respuesta,
      jsonb_build_object('id_respuesta', id_nueva_respuesta));
    INSERT INTO evento_sincronizacion (id_evento, tipo, id_entidad, payload)
    VALUES (gen_random_uuid(), 'INTENTO_FINALIZADO', objetivo.id_intento, 'null'::jsonb);
    RAISE EXCEPTION 'El evento inválido no abortó la transacción';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS restriccion = CONSTRAINT_NAME;
    IF restriccion <> 'ck_evento_payload' THEN
      RAISE;
    END IF;
  END;

  IF EXISTS (SELECT FROM respuesta WHERE id_respuesta = id_nueva_respuesta)
     OR EXISTS (SELECT FROM evento_sincronizacion WHERE id_evento = id_nuevo_evento)
     OR NOT EXISTS (SELECT FROM intento WHERE id_intento = objetivo.id_intento AND estado = 'EN_CURSO')
  THEN
    RAISE EXCEPTION 'La reversión debe incluir respuesta, cierre y evento';
  END IF;

  INSERT INTO evento_sincronizacion (id_evento, tipo, id_entidad, payload)
  VALUES (gen_random_uuid(), 'RESPUESTA_REGISTRADA', id_nueva_respuesta,
    jsonb_build_object('id_respuesta', id_nueva_respuesta))
  RETURNING * INTO primero;
  INSERT INTO evento_sincronizacion (id_evento, tipo, id_entidad, payload)
  VALUES (gen_random_uuid(), 'INTENTO_FINALIZADO', objetivo.id_intento,
    jsonb_build_object('id_intento', objetivo.id_intento))
  RETURNING * INTO segundo;

  IF primero.orden_cola >= segundo.orden_cola OR primero.creado_en <> segundo.creado_en THEN
    RAISE EXCEPTION 'El orden de inserción debe distinguir eventos de la misma transacción';
  END IF;
END $$;
