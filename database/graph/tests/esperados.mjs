// Resultados esperados de C-01..C-05 (database/graph/queries) con el dataset común.
// El ejecutor corre cada consulta con sus parámetros y compara fila por fila:
// fechas como ISO, números con tolerancia 1e-9 y las listas de texto sin importar el orden
// (collect() no garantiza orden). Derivación de cada valor: README de database/graph.
const ANA = 'e0000000-0000-4000-8000-000000000101';
const BRUNO = 'e0000000-0000-4000-8000-000000000102';
const id = (sufijo) => `e0000000-0000-4000-8000-00000000${sufijo}`;

export const CASOS = [
  {
    consulta: 'C-01-recomendaciones.cypher',
    caso: 'C-01 Ana: solo Tres entregas (Gestión del tiempo 40 < 60); ninguna en BORRADOR',
    parametros: { idUsuario: ANA },
    esperado: [
      {
        id_simulacion: id('0302'),
        simulacion: 'Tres entregas para mañana',
        habilidades_a_fortalecer: ['Gestión del tiempo'],
        prioridad: 14,
      },
    ],
  },
  {
    consulta: 'C-01-recomendaciones.cypher',
    caso: 'C-01 Bruno (sin progreso): las 2 publicadas, nivel 0 en todo',
    parametros: { idUsuario: BRUNO },
    esperado: [
      {
        id_simulacion: id('0301'),
        simulacion: 'Cliente molesto por un retraso',
        habilidades_a_fortalecer: ['Comunicación efectiva', 'Resolución de conflictos'],
        prioridad: 66,
      },
      {
        id_simulacion: id('0302'),
        simulacion: 'Tres entregas para mañana',
        habilidades_a_fortalecer: ['Gestión del tiempo', 'Comunicación efectiva'],
        prioridad: 57,
      },
    ],
  },
  {
    consulta: 'C-02-fortalezas.cypher',
    caso: 'C-02 Ana: 2 fortalezas y Gestión del tiempo como área de mejora (respaldo 60)',
    parametros: { idUsuario: ANA },
    esperado: [
      {
        habilidad: 'Resolución de conflictos',
        nivel_actual: 92.5,
        objetivo: 70,
        clasificacion: 'FORTALEZA',
        aciertos: 2,
        parciales: 1,
        errores: 1,
      },
      {
        habilidad: 'Comunicación efectiva',
        nivel_actual: 75,
        objetivo: 75,
        clasificacion: 'FORTALEZA',
        aciertos: 2,
        parciales: 1,
        errores: 2,
      },
      {
        habilidad: 'Gestión del tiempo',
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
    caso: 'C-03 Ana en Cliente molesto: 2 intentos, 4 decisiones ordenadas',
    parametros: { idUsuario: ANA, idSimulacion: id('0301') },
    esperado: [
      ['0703', '2026-09-20T16:00:00Z', 1, '0401', 1, '0502', 'PARCIAL'],
      ['0703', '2026-09-20T16:00:00Z', 2, '0403', 3, '0507', 'ERROR'],
      ['0701', '2026-10-01T10:00:00Z', 1, '0401', 1, '0501', 'ACIERTO'],
      ['0701', '2026-10-01T10:00:00Z', 2, '0402', 2, '0504', 'ACIERTO'],
    ].map(([i, inicio, secuencia, paso, orden, opcion, tipo]) => ({
      id_intento: id(i),
      inicio,
      secuencia,
      id_paso: id(paso),
      orden,
      id_opcion: id(opcion),
      tipo_retroalimentacion: tipo,
    })),
  },
  {
    consulta: 'C-04-evidencias.cypher',
    caso: 'C-04 Ana, Comunicación efectiva: 1 evidencia (DEMUESTRA derivada)',
    parametros: { idUsuario: ANA, habilidad: 'Comunicación efectiva' },
    esperado: [
      {
        id_evidencia: id('1101'),
        evidencia: 'Manejo de un cliente molesto',
        simulacion: 'Cliente molesto por un retraso',
        fecha: '2026-10-01T10:14:00Z',
      },
    ],
  },
  {
    consulta: 'C-04-evidencias.cypher',
    caso: 'C-04 Ana, Gestión del tiempo: la simulación de la evidencia no la desarrolla',
    parametros: { idUsuario: ANA, habilidad: 'Gestión del tiempo' },
    esperado: [],
  },
  {
    consulta: 'C-05-evolucion.cypher',
    caso: 'C-05 Ana, Comunicación efectiva: 37.5 → 92.5 → 40, sin el intento EN_CURSO',
    parametros: { idUsuario: ANA, habilidad: 'Comunicación efectiva' },
    esperado: [
      ['2026-09-20T16:12:00Z', 'Cliente molesto por un retraso', 37.5, 0.6],
      ['2026-10-01T10:14:00Z', 'Cliente molesto por un retraso', 92.5, 0.6],
      ['2026-10-10T18:08:00Z', 'Tres entregas para mañana', 40, 0.3],
    ].map(([fecha, simulacion, puntuacion, peso]) => ({
      fecha,
      simulacion,
      puntuacion,
      peso,
      nivel_actual_consolidado: 75,
    })),
  },
];
