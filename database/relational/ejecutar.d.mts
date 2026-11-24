import type { Client } from 'pg';

export function leerSql(ruta: string): string;
export function leerDataset(): {
  usuario: { id_usuario: string }[];
  simulacion: { id_simulacion: string; estado: string; id_revision_publicada: string | null }[];
  intento: { id_intento: string; id_usuario: string }[];
  comparticion: { token: string; estado: string; fecha_expiracion: string | null }[];
};
export function conectar(opciones?: { reinicioLocal?: boolean }): Client;
export function reconstruir(client: Client, hash?: string): Promise<void>;
export function prepararEsquemaDePrueba(client: Client): Promise<string>;
export function eliminarEsquemaDePrueba(client: Client, esquema: string): Promise<void>;
export function revertir(client: Client): Promise<void>;
