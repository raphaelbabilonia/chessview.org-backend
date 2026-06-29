# Informe de scraping Vesus

Fecha de informe: 2026-06-29
Fuente analizada: https://vesus.org
Repositorio: chessview.org-backend

## Resumen ejecutivo

Se implemento y valido un scraper completo para Vesus usando su API publica GraphQL y el stream publico SSE de pareos. El sistema ya puede importar eventos, secciones, jugadores, rondas, pareos, posiciones, desempates, documentos/reglamentos y metadatos de organizador/contacto.

El resultado actual en base local es:

- 50 eventos Vesus importados.
- 50 secciones importadas.
- 606 jugadores importados.
- 298 rondas importadas.
- 1.934 pareos importados.
- 223 documentos detectados.
- 45 documentos descargados localmente.
- 0 documentos fallidos.
- 0 jugadores placeholder inventados.
- 0 eventos duplicados por `originalId`.

La conclusion principal es que Vesus expone mucha informacion publica util para ChessView, pero no todos los eventos publican jugadores/pareos de forma publica. En esos casos el scraper conserva metadata, documentos y rondas cuando existen, pero no inventa jugadores ni pareos.

## Fuente tecnica usada

El scraper usa endpoints publicos de Vesus:

- API GraphQL: `https://api.vesus.org/graphql`
- Sitio publico: `https://vesus.org`
- Stream SSE publico para detalle de pareos.

Consultas Relay identificadas:

- `EventsPage_Query`
- `TournamentPage_Query`
- `PairingsPage_Query`
- `PairingsPage_Subscription`

La informacion mas completa de jugadores, standings, rondas y resultados sale del stream publico `PairingsPage_Subscription`. Este punto es importante porque no alcanza con leer solamente la pagina HTML.

## Datos encontrados e importados

### Eventos

Por cada evento Vesus se importan, cuando estan disponibles:

- Nombre.
- Slug y URL original.
- Fechas de inicio y fin.
- Pais, ciudad y sede.
- Estado del evento.
- Estado de registracion.
- Organizador.
- Email de contacto.
- Telefono de contacto.
- Fuente original.
- Datos crudos de auditoria en `sourceData`.

### Secciones

Por cada torneo/seccion se importan:

- Nombre de la seccion.
- Sistema de pareo.
- Sistema de puntuacion.
- Regla de rating.
- Fuente de resultados.
- Rating usado para desempates.
- Desempates configurados.
- Cantidad de rondas.

### Jugadores

Por cada jugador publicado por Vesus se importan:

- Nombre.
- Titulo.
- Federacion.
- Genero, cuando existe.
- Año de nacimiento, cuando existe.
- Rating FIDE.
- Rating nacional.
- ID FIDE, cuando existe.
- ID nacional, cuando existe.
- K FIDE y K nacional, cuando existen.
- Ranking inicial.
- Ranking final o fuente.
- Puntos.
- Performance.
- Cambio de rating.
- Desempates.
- Matches/resultados acumulados publicados por Vesus.

### Rondas y pareos

Por cada ronda se importan:

- Numero de ronda.
- Nombre de ronda, cuando Vesus lo publica.
- Estado inferido.
- Pareos por tablero.

Por cada pareo se importan:

- Tablero.
- Blancas y negras.
- Resultado.
- Resultado crudo publicado por Vesus.
- Puntos acumulados del jugador blanco.
- Puntos acumulados del jugador negro.
- Estado del pareo.

Resultados actualmente soportados:

- `1-0`
- `0-1`
- `1/2-1/2`
- `pending`
- `bye-white`
- `bye-black`
- `forfeit-white`
- `forfeit-black`
- `half-bye`
- `zero-bye`

### Documentos y archivos

Vesus publica documentos asociados a eventos. El scraper detecta e importa:

- Reglamentos.
- PDFs.
- Imaganes/documentos adjuntos cuando estan publicados.
- URL original.
- Nombre del archivo.
- Tipo MIME cuando se puede inferir.
- Tamaño cuando se conoce.
- Archivo descargado localmente cuando el recurso publico permite descarga.

En la ultima corrida:

- 223 documentos fueron detectados.
- 45 fueron descargados localmente.
- 0 fallaron.

La diferencia entre documentos detectados y descargados se debe a que no todo adjunto publico queda disponible como archivo descargable directo o no siempre conviene duplicar recursos externos si la URL original ya es la fuente canonica.

## Totales actuales

| Metrica | Cantidad |
| --- | ---: |
| Eventos | 50 |
| Secciones | 50 |
| Jugadores | 606 |
| Rondas | 298 |
| Pareos | 1.934 |
| Documentos detectados | 223 |
| Documentos descargados | 45 |
| Documentos fallidos | 0 |
| Eventos duplicados por `originalId` | 0 |
| Jugadores placeholder | 0 |

## Distribucion de resultados

| Resultado | Cantidad |
| --- | ---: |
| `1-0` | 751 |
| `0-1` | 700 |
| `1/2-1/2` | 140 |
| `pending` | 200 |
| `zero-bye` | 62 |
| `half-bye` | 56 |
| `bye-white` | 20 |
| `forfeit-black` | 3 |
| `forfeit-white` | 2 |

Los 200 pareos `pending` corresponden a torneos actuales/futuros o rondas todavia no finalizadas/publicadas.

## Enriquecimiento encontrado

| Dato enriquecido | Cantidad |
| --- | ---: |
| Jugadores con desempates | 555 |
| Jugadores con matches publicados | 599 |
| Jugadores con año de nacimiento | 563 |
| Jugadores con performance | 553 |
| Secciones con desempates configurados | 26 |
| Eventos con organizador fuente | 50 |
| Eventos con contacto | 50 |

Esto confirma que Vesus no solo sirve para listar torneos: tambien permite reconstruir standings y detalle competitivo con bastante profundidad.

## Ejemplos de eventos con datos completos

Eventos Vesus donde se encontro informacion competitiva completa o muy completa:

- `11° Open Week-End Centro Valle Intelvi ricordando Stefano Leopardi 26-27-28 Giugno 2026 - OPEN A >= 1700`
  - Jugadores, rondas, pareos, standings, documentos y datos de organizador.
- `11° Open Week-End Centro Valle Intelvi ricordando Stefano Leopardi 26-27-28 Giugno 2026 - OPEN B < 1700`
  - Jugadores, rondas, pareos, standings y documentos.
- `IL 64 DI CESANO MADERNO`
  - Jugadores, rondas, pareos y standings completos.
- `IAF Antichess World Championship 2026`
  - Torneo con muchas rondas y pareos completos.
- `June's Combo Rapid`
  - Jugadores, rondas, resultados y standings.
- `Rapid e Stringozzo alla cinta 4th edition 2026`
  - Jugadores, rondas, resultados, standings y estructura de torneo.

## Eventos sin jugadores o pareos publicos

Se detectaron 25 eventos donde Vesus no expone jugadores/pareos publicos mediante `pairingsPlayers`.

Esto no se considera error del scraper. El comportamiento correcto es:

- Importar el evento.
- Importar documentos y metadata disponible.
- No crear jugadores ficticios.
- No crear pareos si no hay jugadores publicos confiables.
- Dejar trazabilidad en `sourceData` para reintentar cuando Vesus publique mas informacion.

Este caso aparece especialmente en:

- Eventos futuros.
- Cursos o actividades no competitivas.
- Torneos con informacion parcial.
- Eventos donde Vesus no publica el detalle completo para usuarios anonimos.

## Estados `status` y `registrationStatus`

`status` representa el estado general del torneo dentro de ChessView. Se infiere desde fechas, timing de Vesus y datos publicados. Ejemplos:

- `published`: evento publicado o futuro.
- `completed`: evento finalizado.
- `cancelled`: evento cancelado, si la fuente lo informa.

`registrationStatus` representa el estado de inscripcion:

- `open`: inscripciones abiertas.
- `closed`: inscripciones cerradas.
- `full`: cupo lleno, si la fuente lo informa.

Son dos conceptos distintos: un torneo puede estar publicado y al mismo tiempo tener registracion cerrada.

## Limitaciones reales encontradas

### Exports VCE, VCT, TRF y PGN

Vesus tiene referencias a exports como VCE/VCT/TRF/PGN, pero el flujo publico probado no permite descargarlos de forma directa sin contexto autenticado de la aplicacion o workspace.

Resultado:

- Se importan documentos publicos.
- Se importan standings, jugadores, rondas y pareos desde API publica.
- No se importan exports privados o dependientes de sesion.

### Informacion incompleta por evento

Algunos eventos publican solo metadata/documentos y no publican jugadores/pareos. El scraper evita completar esos huecos artificialmente.

### Dependencia de API no documentada

La integracion actual funciona sobre endpoints publicos usados por la web de Vesus. Si Vesus cambia sus `docId`, queries Relay o formato SSE, puede requerir mantenimiento.

## Validaciones realizadas

Se valido:

- Importacion de metadata de eventos archivados, actuales y futuros.
- Importacion de detalle desde Vesus.
- Descarga de documentos publicos.
- Ausencia de duplicados por `originalId`.
- Ausencia de jugadores placeholder.
- Consistencia de puntos completados contra puntos fuente.
- Distribucion de resultados.
- Funcionamiento de calculo de standings con desempates de fuente.
- Render visual en Next.js para standings, desempates y performance.
- Build del backend, Next.js y frontend admin.

Resultados de pruebas:

- Backend tests: 27/27 exitosos.
- Backend syntax check: exitoso.
- Next.js lint: exitoso.
- Next.js build: exitoso.
- Admin frontend build: exitoso.

## Comandos usados para reproducir

Importar eventos archivados desde Vesus:

```bash
npm run scrape:sources -- --source vesus-public --mode apply --limit 30 --timings ARCHIVED
```

Importar eventos actuales/futuros desde Vesus:

```bash
npm run scrape:sources -- --source vesus-public --mode apply --limit 20 --timings INPROGRESS,FUTURE
```

Importar detalle completo:

```bash
npm run scrape:details -- --source Vesus --download-documents --rate-limit-ms 1200 --max-document-bytes 15000000 --limit 50
```

Ejecutar tests:

```bash
npm test
```

## Archivos relevantes

Backend:

- `src/scrapers/vesus.js`
- `src/services/tournamentDetailImporter.js`
- `src/models/Event.js`
- `src/models/Section.js`
- `src/models/Player.js`
- `src/models/Round.js`
- `src/models/Pairing.js`
- `src/utils/calculateStandings.js`
- `test/scraping.test.js`

Next.js publico:

- `src/app/[locale]/events/[id]/page.js`
- `src/lib/tournament.js`
- `src/i18n/dictionaries.js`
- `src/app/globals.css`

Admin frontend:

- `src/utils/tournament.js`

## Proximos pasos recomendados

1. Agregar un comando de auditoria formal que genere este informe automaticamente desde MongoDB.
2. Guardar snapshots por corrida para comparar cuantos eventos nuevos trae Vesus por dia.
3. Agregar scheduler backend para scrappear Vesus de forma recurrente.
4. Separar colas de scraping: metadata frecuente, detalle moderado, documentos bajo demanda.
5. Agregar pantalla admin de auditoria de scraping cuando el frontend admin lo necesite.
6. Definir si los documentos descargados se guardaran localmente, en S3 compatible o solo como URL canonica.
7. Reintentar automaticamente eventos sin jugadores/pareos cuando pasen de futuros a en progreso/finalizados.

## Conclusion

Vesus ya quedo como una fuente viable para ChessView. El scraper obtiene informacion competitiva real y enriquecida, evita inventar datos cuando la fuente no publica detalle, y deja una base solida para indexacion publica en Next.js y futuras pantallas administrativas.
