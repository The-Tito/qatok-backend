// Resultados esperados de C-01..C-05 (database/graph/queries) con el dataset común.
// El ejecutor corre cada consulta con sus parámetros y compara fila por fila:
// fechas como ISO, números con tolerancia 1e-9 y las listas de texto sin importar el orden
// (collect() no garantiza orden). Derivación de cada valor: README de database/graph.
// El repositorio de grafo del backend (backend/src/repositories/graph) se prueba con estos
// mismos casos (tests/integration/repositorio-grafo.test.ts).
const ANA = 'e0000000-0000-4000-8000-000000000101';
const BRUNO = 'e0000000-0000-4000-8000-000000000102';
const id = (sufijo) => `e0000000-0000-4000-8000-00000000${sufijo}`;

const COMUNICACION = id('0201');
const RESOLUCION = id('0202');
const GESTION = id('0203');
const CLIENTE = { id_simulacion: id('0301'), titulo: 'Cliente molesto por un retraso' };
const ENTREGAS = { id_simulacion: id('0302'), titulo: 'Tres entregas para mañana' };

const decision = ([secuencia, paso, orden, opcion, tipo]) => ({
  secuencia,
  id_paso: id(paso),
  orden,
  id_opcion: id(opcion),
  tipo_retroalimentacion: tipo,
});

export const CASOS = [
  {
    consulta: 'C-01-recomendaciones.cypher',
    caso: 'C-01 Ana: solo Tres entregas (Gestión del tiempo 40 < 60); ninguna en BORRADOR',
    parametros: { idUsuario: ANA, limite: 10 },
    esperado: [
      { simulacion: ENTREGAS, habilidades_a_reforzar: ['Gestión del tiempo'], prioridad: 14 },
    ],
  },
  {
    consulta: 'C-01-recomendaciones.cypher',
    caso: 'C-01 Bruno (sin progreso): las 2 publicadas, nivel 0 en todo',
    parametros: { idUsuario: BRUNO, limite: 10 },
    esperado: [
      {
        simulacion: CLIENTE,
        habilidades_a_reforzar: ['Comunicación efectiva', 'Resolución de conflictos'],
        prioridad: 66,
      },
      {
        simulacion: ENTREGAS,
        habilidades_a_reforzar: ['Gestión del tiempo', 'Comunicación efectiva'],
        prioridad: 57,
      },
    ],
  },
  {
    consulta: 'C-01-recomendaciones.cypher',
    caso: 'C-01 Bruno con límite 1: solo la de mayor prioridad',
    parametros: { idUsuario: BRUNO, limite: 1 },
    esperado: [
      {
        simulacion: CLIENTE,
        habilidades_a_reforzar: ['Comunicación efectiva', 'Resolución de conflictos'],
        prioridad: 66,
      },
    ],
  },
  {
    consulta: 'C-02-fortalezas.cypher',
    caso: 'C-02 Ana: 2 fortalezas y Gestión del tiempo como área de mejora (respaldo 60)',
    parametros: { idUsuario: ANA },
    esperado: [
      {
        id_habilidad: RESOLUCION,
        nombre: 'Resolución de conflictos',
        nivel_actual: 92.5,
        objetivo: 70,
        clasificacion: 'FORTALEZA',
        aciertos: 2,
        parciales: 1,
        errores: 1,
      },
      {
        id_habilidad: COMUNICACION,
        nombre: 'Comunicación efectiva',
        nivel_actual: 75,
        objetivo: 75,
        clasificacion: 'FORTALEZA',
        aciertos: 2,
        parciales: 1,
        errores: 2,
      },
      {
        id_habilidad: GESTION,
        nombre: 'Gestión del tiempo',
        nivel_actual: 40,
        objetivo: 60,
        clasificacion: 'AREA_DE_MEJORA',
        aciertos: 0,
        parciales: 0,
        errores: 1,
      },
    ],
  },
  {
    consulta: 'C-02-fortalezas.cypher',
    caso: 'C-02 Bruno: sin progreso, sin filas',
    parametros: { idUsuario: BRUNO },
    esperado: [],
  },
  {
    consulta: 'C-03-recorrido.cypher',
    caso: 'C-03 Ana, intento 0701: 2 decisiones ordenadas por secuencia',
    parametros: { idUsuario: ANA, idIntento: id('0701') },
    esperado: [
      {
        intento: {
          id_intento: id('0701'),
          id_simulacion: CLIENTE.id_simulacion,
          estado: 'COMPLETADO',
          fecha_inicio: '2026-10-01T10:00:00Z',
          fecha_fin: '2026-10-01T10:14:00Z',
          puntuacion: 92.5,
        },
        decisiones: [
          [1, '0401', 1, '0501', 'ACIERTO'],
          [2, '0402', 2, '0504', 'ACIERTO'],
        ].map(decision),
      },
    ],
  },
  {
    consulta: 'C-03-recorrido.cypher',
    caso: 'C-03 Ana, intento 0704 EN_CURSO: sin decisiones, sin fecha_fin ni puntuación',
    parametros: { idUsuario: ANA, idIntento: id('0704') },
    esperado: [
      {
        intento: {
          id_intento: id('0704'),
          id_simulacion: ENTREGAS.id_simulacion,
          estado: 'EN_CURSO',
          fecha_inicio: '2026-11-11T09:00:00Z',
          fecha_fin: null,
          puntuacion: null,
        },
        decisiones: [],
      },
    ],
  },
  {
    consulta: 'C-03-recorrido.cypher',
    caso: 'C-03 Bruno pide el intento 0701 de Ana: sin filas (solo el dueño)',
    parametros: { idUsuario: BRUNO, idIntento: id('0701') },
    esperado: [],
  },
  {
    consulta: 'C-04-evidencias.cypher',
    caso: 'C-04 Ana, Comunicación efectiva: 1 evidencia (DEMUESTRA derivada)',
    parametros: { idUsuario: ANA, idHabilidad: COMUNICACION },
    esperado: [
      {
        id_evidencia: id('1101'),
        titulo: 'Manejo de un cliente molesto',
        simulacion: CLIENTE,
        fecha_intento: '2026-10-01T10:14:00Z',
      },
    ],
  },
  {
    consulta: 'C-04-evidencias.cypher',
    caso: 'C-04 Ana, Gestión del tiempo: la simulación de la evidencia no la desarrolla',
    parametros: { idUsuario: ANA, idHabilidad: GESTION },
    esperado: [],
  },
  {
    consulta: 'C-05-evolucion.cypher',
    caso: 'C-05 Ana, Comunicación efectiva: 37.5 → 92.5 → 40, sin el intento EN_CURSO',
    parametros: { idUsuario: ANA, idHabilidad: COMUNICACION },
    esperado: [
      {
        nivel_actual: 75,
        puntos: [
          ['2026-09-20T16:12:00Z', CLIENTE, 37.5, 0.6],
          ['2026-10-01T10:14:00Z', CLIENTE, 92.5, 0.6],
          ['2026-10-10T18:08:00Z', ENTREGAS, 40, 0.3],
        ].map(([fecha, simulacion, puntuacion, peso]) => ({
          fecha,
          ...simulacion,
          puntuacion,
          peso,
        })),
      },
    ],
  },
  {
    consulta: 'C-05-evolucion.cypher',
    caso: 'C-05 Bruno, Comunicación efectiva: sin progreso ni puntos',
    parametros: { idUsuario: BRUNO, idHabilidad: COMUNICACION },
    esperado: [{ nivel_actual: null, puntos: [] }],
  },
  {
    consulta: 'C-05-evolucion.cypher',
    caso: 'C-05 habilidad que no existe: sin filas (404 en el servicio)',
    parametros: { idUsuario: ANA, idHabilidad: id('0299') },
    esperado: [],
  },
];
