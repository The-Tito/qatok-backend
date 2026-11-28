# Configuración de GitHub

**Decisión del equipo (2026-11-19): avanzar sin candados.** Los issues y el tablero dicen en qué trabaja cada quien; nadie espera la aprobación de otro para fusionar. Por eso **no hay** protección de ramas, `CODEOWNERS` ni plantilla de PR.

## Qué sí hay

| Qué | Dónde | Para qué |
|---|---|---|
| Rama por defecto `develop` (en los dos repos) | Settings → General | Los PR se abren contra `develop` y el panel Contributors cuenta el trabajo del equipo |
| CI "Verificar" | `.github/workflows/ci.yml` | Corre lint, tipos, pruebas y las 3 bases en cada push y PR. **Es un aviso**: no bloquea el merge |
| Issues + milestones + etiquetas | Pestaña Issues | Una tarea del plan por issue; milestone = fase; `perfil:A/B/C` = de quién es |
| Tablero | GitHub Project «QATO'K — Proyecto final» (cuenta @The-Tito): https://github.com/users/The-Tito/projects/1 | Ver en qué va cada uno (Todo / In Progress / Done) |
| GitGuardian | App de GitHub (estaba en BDLN-U3; hay que agregar los repos nuevos en su configuración) | Avisa si se sube una credencial. Nunca subir `.env` (ya está en `.gitignore`) |

El flujo diario está en [`como-trabajar.md`](como-trabajar.md).

## Repositorios

| Repo | Admin | CI |
|---|---|---|
| `The-Tito/qatok-backend` | @The-Tito | 3 bases en Docker + lint, tipos, unitarias, integración, dataset y modelo |
| `The-Tito/qatok-frontend` | @The-Tito | lint, formato, tipos y `check:shared` (la copia de `shared/` debe coincidir con `develop` del backend) |

Los dos usan `develop` como rama por defecto, sin protección de ramas. @lsprz2773 y @AngelChame están invitados con acceso **Write** (aceptar la invitación en GitHub). El monorepo anterior, `lsprz2773/BDLN-U3`, quedó archivado (solo lectura).

## Acceso al tablero

El dueño del Project (@The-Tito) da acceso **Write** a @lsprz2773 y @AngelChame en Project → ⋯ → Settings → Manage access, para que puedan mover sus tarjetas.

## Equivalencia de issues (migración 2026-11-19)

Los issues abiertos de `lsprz2773/BDLN-U3` se recrearon aquí y en el frontend con sus etiquetas y milestones; cada uno enlaza al original. Los de interfaz están en `qatok-frontend`.

| BDLN-U3 | Ahora | Tarea |
|---|---|---|
| #2 | backend #2 | [Equipo] Aprobar los acuerdos de la fase 0 (matriz, convenciones, contrato, dataset) |
| #5 | backend #3 | [A] Tablero de GitHub Projects con estos issues |
| #6 | backend #4 | [A] Neo4j: adaptar el grafo a la matriz v2, cargarlo desde el dataset y probarlo |
| #7 | backend #5 | [A] E2: modelo lógico de grafo (docs/modelos/grafo.md) |
| #8 | backend #6 | [A] Repositorio de grafo: consultas C-01 a C-05 parametrizadas |
| #9 | backend #7 | [A] Sincronización hacia Neo4j (outbox, reintento) y reconciliación |
| #10 | backend #8 | [A] F3a backend: perfil integrado de las 3 bases y evidencias |
| #11 | frontend #2 | [A] F3a interfaz: perfil, recomendaciones, recorrido y evidencias |
| #12 | backend #9 | [A] Pruebas de integración (perfil) y de consistencia (reconciliación) |
| #13 | backend #10 | [A] E3: documento de arquitectura (docs/arquitectura.md) |
| #14 | backend #11 | [B] Borrador de las tablas a partir del diccionario y las restricciones |
| #15 | backend #12 | [B] PostgreSQL: esquema, carga desde el dataset, consultas y pruebas |
| #16 | backend #13 | [B] E2: modelo lógico relacional (docs/modelos/relacional.md) |
| #17 | backend #14 | [B] Repositorio relacional y autenticación (bcrypt + JWT, rol ADMIN) |
| #18 | backend #15 | [B] F1 backend: cuenta, habilidades, catálogo y administración de simulaciones |
| #19 | backend #16 | [B] F3b backend: compartir evidencias con token, vencimiento y revocación |
| #20 | frontend #3 | [B] F1 y F3b interfaz: registro, login, catálogo, administración y compartir |
| #21 | backend #17 | [B] Pruebas de conectividad y de rendimiento (docs/pruebas/rendimiento.md) |
| #22 | backend #18 | [B] E5: catálogo de operaciones y consultas |
| #23 | frontend #4 | [C] Esqueleto de la interfaz en Next.js, bocetos y borrador de E1 |
| #24 | backend #19 | [C] MongoDB: colecciones, validadores, carga desde el dataset, consultas y pruebas |
| #25 | backend #20 | [C] E2: modelo documental (docs/modelos/documental.md) |
| #26 | backend #21 | [C] Repositorio documental (lo usan F1, F2 y F3a) |
| #27 | backend #22 | [C] F2 backend: iniciar intento y responder un paso |
| #28 | frontend #5 | [C] F2 interfaz: jugar una simulación (móvil) |
| #29 | backend #23 | [C] Pruebas de errores de la API (sin la e2e, descartada) |
| #30 | backend #24 | [C] E1: propuesta final y README completo |
| #31 | backend #25 | [Equipo] Correr las 7 pruebas de integración y guardar la salida fechada en docs/pruebas/ |
| #32 | backend #26 | [Equipo] Instalación cruzada: cada quien instala desde cero siguiendo el README y anota lo que falle |
| #33 | backend #27 | [Equipo] E2 completo: modelo conceptual común, los 3 modelos lógicos y el diccionario |
| #34 | backend #28 | [Equipo] Release 2.0.0: rama release/2.0.0 y merge a main |
| #35 | backend #29 | [Equipo] Ensayo de la defensa: cada quien explica su flujo pasando por las 3 bases |
