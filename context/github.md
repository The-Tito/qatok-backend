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
