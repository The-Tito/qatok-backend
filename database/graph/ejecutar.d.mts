// Tipos del ejecutor de database/graph para importarlo desde las pruebas en TypeScript.
import type { Driver } from 'neo4j-driver';

export interface ResultadoPrueba {
  grupo: string;
  prueba: string;
  ok: boolean;
  detalle: string;
}

export interface ResultadoProbar {
  neo4j: string;
  grafo: { nodos: number; relaciones: number };
  resultados: ResultadoPrueba[];
  fallos: ResultadoPrueba[];
}

export const ORDEN_RESET: string[];
export const PRUEBAS: string[];
export function conectar(): Driver;
export function sentencias(relativo: string): { titulo: string; cypher: string }[];
export function ejecutarArchivo(driver: Driver, relativo: string): Promise<number>;
export function vaciar(driver: Driver): Promise<void>;
export function reset(
  driver: Driver,
  log?: (linea: string) => void,
): Promise<{ nodos: number; relaciones: number }>;
export function normalizar(valor: unknown): unknown;
export function iguales(a: unknown, b: unknown): boolean;
export function probar(driver: Driver, log?: (linea: string) => void): Promise<ResultadoProbar>;
export function informe(resultado: ResultadoProbar, fecha: string, commit: string): string;
