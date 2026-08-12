# Operational brain boundary

The private sibling repository `chessview.org-brain` owns ChessView research logic, source policy, deterministic connectors, immutable review queues, the shared publishing outbox, tracking audits, and local scheduler definitions.

This backend owns HTTP APIs, authentication, private ingest, and database writes. It also retains `src/scripts/backfillEventCoordinatesViaApi.js` because both production deployment workflows invoke that CLI on the deployed server.

Temporary `agent:*` and `tracking:audit` package scripts call `src/scripts/forwardBrainCommand.js`. The shim resolves `CHESSVIEW_BRAIN_ROOT` or the default sibling checkout, forwards every argument without shell interpolation, inherits stdio, and exits with the brain command's exit code. `agent:review-public` remains backend-native because it is database-coupled. `events:coordinates:api` also remains backend-native for production deployment.

The compatibility shims must remain until an explicit follow-up after at least one successful full scheduled day and one successful backend deployment.

Do not recreate operational state under this repository. The old workspace names remain ignored only as a safety guard against accidental local recreation.
