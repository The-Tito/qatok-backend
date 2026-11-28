# E8. Evidencia de pruebas de QATO'K

El 27 de noviembre de 2026 se ejecutó la suite del backend `d843833` contra PostgreSQL, MongoDB y Neo4j en volúmenes temporales. Vitest registró **88 de 88 pruebas aprobadas en 13 archivos** en 20.80 s. Los reportes muestran qué se verificó en cada tipo de prueba de la guía. Un caso puede respaldar varios tipos, por lo que los resultados de los reportes no se suman. [Salida de Vitest](2026-11-27-salida-integracion.txt) · [CI del mismo commit](https://github.com/The-Tito/qatok-backend/actions/runs/46104440235) · [Guía, §9](../../context/guia/Guia_Proyecto_Final_Bases_Datos.pdf)

| Tipo | Reporte |
|---|---|
| Conectividad | [Salud de los tres motores](2026-11-27-conectividad.md) |
| Funcional | [Cuentas, catálogo, juego, perfil y enlaces](2026-11-27-funcional.md) |
| Integridad | [Restricciones y consultas de validación](2026-11-27-integridad.md) |
| Integración | [Publicación, decisión, perfil y evidencia](2026-11-27-integracion.md) |
| Consistencia | [Cola, reintento y reconciliación](2026-11-27-consistencia.md) |
| Errores | [Validación, conexiones y escrituras parciales](2026-11-27-errores.md) |
| Rendimiento | [Medición local de F2, F3a y F3b](2026-11-27-rendimiento.md) |

## Entorno de la corrida

- Apple M4 Pro (12 núcleos, 24 GiB de RAM), macOS 27.2.1 arm64. Node.js 26.10.0, npm 11.19.1, Python 3.13.2 y Vitest 5.1.1.
- Docker Engine 29.9.2, Compose 5.6.1. VM con 12 CPU y 7.75 GiB de RAM. Imágenes arm64 de PostgreSQL `16-alpine` (`1d5b02d3a994`), MongoDB `7` (`884c055bff8b`) y Neo4j `5-community` (`577eb43120e8`).
- Dataset `database/seed/dataset.json`, SHA-256 `d98c919afcd2a436e3205ea4e5256bdc0ff36f10a823abb3a17573f5fc4155b8`.
- En el CI del mismo commit también pasaron 28 unitarias, 350 comprobaciones del dataset y 832 del modelo. La instalación cruzada entre integrantes y el ensayo de demostración quedaron fuera de esta validación.

## Reproducir la suite en bases aisladas

Desde la raíz del backend, instala con `npm ci` y genera `.env` con `npm run setup:env`. Usa Docker Compose v2 con soporte para `!reset` y `!override`. Ejecuta en Bash o Zsh. La pareja de archivos Compose usa puertos locales y volúmenes exclusivos del proyecto temporal.

```bash
(
  set -e
  export POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=25433 POSTGRES_DB=qatok_validacion
  export MONGO_HOST=127.0.0.1 MONGO_PORT=47018 MONGO_DB=qatok_validacion
  export NEO4J_HOST=127.0.0.1 NEO4J_BOLT_PORT=18688
  proyecto="qatok-e8-$(date +%s)-$$"
  compose_e8() {
    docker compose -p "$proyecto" -f docker-compose.yml -f tests/performance/compose.override.yml "$@"
  }
  trap 'compose_e8 down --volumes' EXIT
  compose_e8 up -d --wait
  CI=true npm run test:integration -- --reporter=verbose
)
```

La suite prepara los datos que necesita. La limpieza elimina los volúmenes del proyecto temporal. Para reproducir la medición de rendimiento, usa el comando del [reporte de rendimiento](2026-11-27-rendimiento.md).
