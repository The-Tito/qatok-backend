const uuid = {
  bsonType: 'string',
  pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
};
const texto = (maxLength) => ({ bsonType: 'string', minLength: 1, maxLength, pattern: '\\S' });
const entero = { bsonType: 'number', minimum: 1, multipleOf: 1 };
const nivel = { bsonType: 'number', minimum: 0, maximum: 100 };
const fecha = { bsonType: 'date' };
const lista = (items, minItems, maxItems) => ({ bsonType: 'array', items, minItems, maxItems });
const catalogo = (...valores) => ({ enum: valores });
const objeto = (properties, opcionales = []) => ({
  bsonType: 'object',
  properties,
  required: Object.keys(properties).filter((campo) => !opcionales.includes(campo)),
  additionalProperties: false,
});

const contextos = {
  CORREO: objeto({ remitente: texto(200), asunto: texto(200), cuerpo: texto(5000) }),
  REUNION: objeto({ participantes: lista(texto(150), 1, 20), agenda: lista(texto(300), 1, 20) }),
  CONVERSACION: objeto({
    interlocutor: texto(150),
    lineas: lista(objeto({ quien: texto(100), texto: texto(1000) }), 1, 50),
  }),
  TAREA: objeto({
    entregables: lista(texto(300), 1, 20),
    plazo_horas: { bsonType: 'number', minimum: 0, exclusiveMinimum: true, maximum: 8760 },
  }),
  INCIDENTE: objeto({
    cronologia: lista(objeto({ momento: texto(100), hecho: texto(1000) }), 1, 50),
    severidad: catalogo('BAJA', 'MEDIA', 'ALTA'),
  }),
};

const tipoPaso = catalogo(...Object.keys(contextos));
const tipoRetroalimentacion = catalogo('ACIERTO', 'PARCIAL', 'ERROR');
const consecuencia = objeto(
  {
    id_consecuencia: uuid,
    descripcion: texto(1000),
    impacto: catalogo('POSITIVO', 'NEUTRO', 'NEGATIVO'),
    tipo: catalogo('RELACIONAL', 'TIEMPO', 'CALIDAD', 'REPUTACION'),
  },
  ['id_consecuencia'],
);

function pasos(minimo) {
  const opcion = objeto({
    id_opcion: uuid,
    descripcion: texto(1000),
    valoracion: nivel,
    id_paso_siguiente: { anyOf: [uuid, { bsonType: 'null' }] },
    consecuencias: lista(consecuencia, minimo, 3),
    retroalimentacion: objeto({
      tipo: tipoRetroalimentacion,
      comentario: texto(1000),
      recomendacion: texto(1000),
    }),
  });

  return lista(
    {
      oneOf: Object.entries(contextos).map(([tipo, contexto]) =>
        objeto({
          id_paso: uuid,
          orden: entero,
          tipo: catalogo(tipo),
          titulo: texto(150),
          descripcion: texto(1000),
          contexto,
          opciones: lista(opcion, minimo, 6),
        }),
      ),
    },
    minimo,
    30,
  );
}

export const colecciones = {
  contenidos_simulacion: objeto({ _id: uuid, version: entero, pasos: pasos(0) }),
  revisiones_simulacion: objeto({
    _id: uuid,
    id_simulacion: uuid,
    version: entero,
    creado_en: fecha,
    pasos: pasos(1),
  }),
  evidencias: objeto({
    _id: uuid,
    descripcion: texto(5000),
    simulacion: objeto({ id_simulacion: uuid, titulo: texto(150) }),
    puntuacion: nivel,
    habilidades: lista(objeto({ id_habilidad: uuid, nombre: texto(150) }), 1, 20),
    decisiones: lista(
      objeto({
        secuencia: entero,
        paso: objeto({ titulo: texto(150), tipo: tipoPaso }),
        opcion: texto(1000),
        consecuencias: lista(texto(1000), 1, 3),
        retroalimentacion_tipo: tipoRetroalimentacion,
      }),
      1,
      100,
    ),
    creado_en: fecha,
  }),
};
