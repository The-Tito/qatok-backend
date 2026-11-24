CREATE TABLE usuario (
  id_usuario UUID CONSTRAINT pk_usuario PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL CHECK (btrim(nombre) <> ''),
  correo VARCHAR(150) NOT NULL CHECK (btrim(correo) <> ''),
  contrasena_hash TEXT NOT NULL CHECK (contrasena_hash <> ''),
  rol VARCHAR(20) NOT NULL CHECK (rol IN ('ESTUDIANTE', 'ADMIN')),
  estado VARCHAR(20) NOT NULL CHECK (estado IN ('ACTIVO', 'INACTIVO', 'SUSPENDIDO')),
  fecha_registro TIMESTAMPTZ NOT NULL
);

CREATE TABLE habilidad (
  id_habilidad UUID CONSTRAINT pk_habilidad PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL CONSTRAINT uq_habilidad_nombre UNIQUE CHECK (btrim(nombre) <> ''),
  descripcion TEXT NOT NULL,
  categoria VARCHAR(50) NOT NULL,
  nivel_objetivo NUMERIC(5,2) CHECK (nivel_objetivo BETWEEN 0 AND 100)
);

CREATE TABLE simulacion (
  id_simulacion UUID CONSTRAINT pk_simulacion PRIMARY KEY,
  titulo VARCHAR(150) NOT NULL CHECK (btrim(titulo) <> ''),
  descripcion TEXT NOT NULL,
  dificultad VARCHAR(20) NOT NULL CHECK (dificultad IN ('BASICA', 'INTERMEDIA', 'AVANZADA')),
  estado VARCHAR(20) NOT NULL CHECK (estado IN ('BORRADOR', 'PUBLICADA', 'INACTIVA')),
  duracion_estimada INTEGER CHECK (duracion_estimada > 0),
  id_revision_publicada UUID CONSTRAINT uq_simulacion_revision_publicada UNIQUE,
  CONSTRAINT ck_simulacion_revision_publicada
    CHECK ((estado = 'BORRADOR') = (id_revision_publicada IS NULL))
);

CREATE TABLE simulacion_habilidad (
  id_simulacion UUID NOT NULL CONSTRAINT fk_simulacion_habilidad_simulacion
    REFERENCES simulacion ON DELETE CASCADE,
  id_habilidad UUID NOT NULL CONSTRAINT fk_simulacion_habilidad_habilidad
    REFERENCES habilidad ON DELETE RESTRICT,
  peso NUMERIC(3,2) NOT NULL CHECK (peso > 0 AND peso <= 1),
  nivel_esperado NUMERIC(5,2) NOT NULL CHECK (nivel_esperado BETWEEN 0 AND 100),
  CONSTRAINT pk_simulacion_habilidad PRIMARY KEY (id_simulacion, id_habilidad)
);

CREATE TABLE intento (
  id_intento UUID CONSTRAINT pk_intento PRIMARY KEY,
  id_usuario UUID NOT NULL CONSTRAINT fk_intento_usuario REFERENCES usuario ON DELETE CASCADE,
  id_simulacion UUID NOT NULL CONSTRAINT fk_intento_simulacion REFERENCES simulacion ON DELETE RESTRICT,
  fecha_inicio TIMESTAMPTZ NOT NULL,
  estado VARCHAR(20) NOT NULL,
  fecha_fin TIMESTAMPTZ,
  puntuacion NUMERIC(5,2),
  CONSTRAINT uq_intento_id_usuario UNIQUE (id_intento, id_usuario),
  CONSTRAINT ck_intento_estado CHECK (estado IN ('EN_CURSO', 'COMPLETADO', 'ABANDONADO')),
  CONSTRAINT ck_intento_fecha_fin CHECK (
    (estado = 'EN_CURSO' AND fecha_fin IS NULL)
    OR (estado IN ('COMPLETADO', 'ABANDONADO') AND fecha_fin IS NOT NULL AND fecha_fin >= fecha_inicio)
  ),
  CONSTRAINT ck_intento_puntuacion CHECK (
    (estado = 'COMPLETADO' AND puntuacion IS NOT NULL AND puntuacion BETWEEN 0 AND 100)
    OR (estado IN ('EN_CURSO', 'ABANDONADO') AND puntuacion IS NULL)
  )
);

CREATE TABLE respuesta (
  id_respuesta UUID CONSTRAINT pk_respuesta PRIMARY KEY,
  id_intento UUID NOT NULL CONSTRAINT fk_respuesta_intento REFERENCES intento ON DELETE CASCADE,
  -- El servicio valida ambos IDs contra la revisión publicada en MongoDB.
  id_paso UUID NOT NULL,
  id_opcion UUID NOT NULL,
  fecha_respuesta TIMESTAMPTZ NOT NULL,
  secuencia INTEGER NOT NULL CHECK (secuencia >= 1),
  CONSTRAINT uq_respuesta_intento_secuencia UNIQUE (id_intento, secuencia)
);

CREATE TABLE evidencia (
  id_evidencia UUID CONSTRAINT pk_evidencia PRIMARY KEY,
  id_intento UUID NOT NULL CONSTRAINT uq_evidencia_intento UNIQUE,
  id_usuario UUID NOT NULL,
  titulo VARCHAR(150) NOT NULL CHECK (btrim(titulo) <> ''),
  fecha_generacion TIMESTAMPTZ NOT NULL,
  visibilidad VARCHAR(20) NOT NULL DEFAULT 'PRIVADA' CHECK (visibilidad IN ('PRIVADA', 'PUBLICA')),
  CONSTRAINT fk_evidencia_intento_dueno FOREIGN KEY (id_intento, id_usuario)
    REFERENCES intento (id_intento, id_usuario) ON DELETE CASCADE
);

CREATE TABLE comparticion (
  id_comparticion UUID CONSTRAINT pk_comparticion PRIMARY KEY,
  id_evidencia UUID NOT NULL CONSTRAINT fk_comparticion_evidencia REFERENCES evidencia ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL CONSTRAINT uq_comparticion_token UNIQUE CHECK (token <> ''),
  fecha_creacion TIMESTAMPTZ NOT NULL,
  estado VARCHAR(20) NOT NULL CHECK (estado IN ('ACTIVA', 'REVOCADA')),
  fecha_expiracion TIMESTAMPTZ,
  destinatario VARCHAR(150),
  CONSTRAINT ck_comparticion_vigencia CHECK (fecha_expiracion > fecha_creacion)
);

CREATE TABLE evento_sincronizacion (
  id_evento UUID CONSTRAINT pk_evento_sincronizacion PRIMARY KEY,
  orden_cola BIGINT GENERATED ALWAYS AS IDENTITY CONSTRAINT uq_evento_orden_cola UNIQUE,
  tipo VARCHAR(40) NOT NULL CHECK (tipo IN (
    'USUARIO_CREADO', 'USUARIO_ELIMINADO', 'HABILIDAD_GUARDADA', 'HABILIDAD_ELIMINADA',
    'SIMULACION_PUBLICADA', 'SIMULACION_ESTADO_CAMBIADO', 'INTENTO_INICIADO',
    'RESPUESTA_REGISTRADA', 'INTENTO_FINALIZADO', 'EVIDENCIA_GENERADA', 'EVIDENCIA_ELIMINADA'
  )),
  id_entidad UUID NOT NULL,
  payload JSONB NOT NULL CONSTRAINT ck_evento_payload CHECK (jsonb_typeof(payload) = 'object'),
  estado VARCHAR(10) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'APLICADO', 'FALLIDO')),
  intentos INTEGER NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_error TEXT,
  aplicado_en TIMESTAMPTZ,
  CONSTRAINT ck_evento_aplicado_en CHECK ((estado = 'APLICADO') = (aplicado_en IS NOT NULL))
);
