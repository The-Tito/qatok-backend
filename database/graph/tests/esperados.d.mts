// Tipos de tests/esperados.mjs para importarlo desde las pruebas en TypeScript.
export interface CasoConsulta {
  consulta: string;
  caso: string;
  parametros: Record<string, unknown>;
  esperado: Record<string, unknown>[];
}

export const CASOS: CasoConsulta[];
