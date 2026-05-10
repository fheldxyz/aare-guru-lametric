# New Architecture

This document describes a target architecture for a reliable Aare Guru to LaMetric adapter service.

## Service Requirements

The service should satisfy these functional requirements:

1. Accept HTTP requests from LaMetric clients.
2. Support a city query parameter.
3. Support graph and non-graph response modes.
4. Fetch current and historical temperature data from Aare Guru.
5. Convert upstream data into valid LaMetric `frames`.
6. Return predictable JSON responses.
7. Remain stateless so it can run on simple hosting platforms.

The service should satisfy these non-functional requirements:

1. Be reliable when the upstream API is slow or temporarily unavailable.
2. Return useful HTTP status codes.
3. Validate client input before calling the upstream API.
4. Avoid malformed LaMetric responses.
5. Be testable without depending exclusively on live upstream data.
6. Provide operational visibility through logs and health checks.
7. Keep deployment simple.
8. Avoid deprecated dependencies.
9. Make future changes low-risk by separating responsibilities.

## Target Runtime Shape

```text
LaMetric client
  |
  | GET /?city=<city>&graph=<true|false>
  v
HTTP API layer
  |
  | validated request
  v
Application service
  |
  | fetch city data
  v
Aare Guru client
  |
  | normalized upstream data
  v
LaMetric formatter
  |
  | response DTO
  v
HTTP API layer
  |
  | JSON response
  v
LaMetric client
```

## Proposed Module Structure

```text
src/
  server.js
  app.js
  routes/
    lametricRoute.js
    healthRoute.js
  services/
    aareLametricService.js
  clients/
    aareGuruClient.js
  formatters/
    lametricFormatter.js
  validation/
    requestValidation.js
  errors/
    httpErrors.js
  logging/
    logger.js
test/
  unit/
  integration/
  blackbox/
```

## Component Responsibilities

### Server Entry Point

`server.js`

Responsibilities:

1. Read environment configuration.
2. Start the HTTP server.
3. Handle process-level shutdown.
4. Keep listen/startup behavior separate from app construction.

This keeps the Express app importable in tests without opening a network port.

### Express App

`app.js`

Responsibilities:

1. Create the Express app.
2. Register routes.
3. Register centralized error handling.
4. Register request logging middleware if needed.

### LaMetric Route

`routes/lametricRoute.js`

Responsibilities:

1. Read query parameters.
2. Validate request input.
3. Call the application service.
4. Send JSON responses.

The route should not know how Aare Guru data is fetched or how chart data is scaled.

### Health Route

`routes/healthRoute.js`

Responsibilities:

1. Provide `GET /health`.
2. Return basic service status.
3. Optionally include version and uptime.

The health route should not call Aare Guru by default, because platform health checks should not depend on a third-party API.

### Application Service

`services/aareLametricService.js`

Responsibilities:

1. Coordinate request handling.
2. Ask the Aare Guru client for upstream data.
3. Ask the formatter to produce LaMetric frames.
4. Map domain failures to service-level errors.

### Aare Guru Client

`clients/aareGuruClient.js`

Responsibilities:

1. Build upstream URLs safely with `URL` and `URLSearchParams`.
2. Encode query parameters.
3. Set explicit request timeouts.
4. Parse upstream JSON.
5. Validate minimum upstream shape.
6. Return normalized data to the application service.

Recommended behavior:

1. Timeout after a short threshold, for example 3 to 5 seconds.
2. Return typed errors for timeout, bad status, invalid JSON, and invalid upstream data.
3. Use the built-in `fetch` API on modern Node, or a maintained HTTP client.

### LaMetric Formatter

`formatters/lametricFormatter.js`

Responsibilities:

1. Build text frames.
2. Build optional chart frames.
3. Normalize chart data into the LaMetric-supported range.
4. Handle edge cases such as flat temperatures or short history.
5. Guarantee that successful formatter output is valid LaMetric JSON.

The graph formatter should define explicit behavior for:

1. No historical data.
2. Fewer than 37 historical samples.
3. Equal minimum and maximum temperatures.
4. Non-numeric upstream temperature values.

### Validation

`validation/requestValidation.js`

Responsibilities:

1. Require or default `city`.
2. Restrict allowed `graph` values.
3. Normalize booleans.
4. Return clear validation errors.

Possible city policy:

1. Allow any non-empty city string and let Aare Guru decide availability.
2. Or maintain an allow-list if the upstream API has a stable city catalog.

The first option is simpler and avoids stale local city data.

### Error Handling

`errors/httpErrors.js`

Responsibilities:

1. Define application error types.
2. Map validation errors to `400`.
3. Map upstream timeout or bad gateway errors to `502` or `504`.
4. Map unexpected errors to `500`.

All error responses should be JSON.

Example:

```json
{
  "error": {
    "code": "UPSTREAM_TIMEOUT",
    "message": "Aare Guru did not respond in time"
  }
}
```

## HTTP API Contract

### Main Endpoint

```text
GET /
```

Query parameters:

```text
city=<required non-empty string>
graph=<optional boolean, default false>
```

Success response:

```json
{
  "frames": [
    { "text": "Bern 12.4°", "icon": null },
    { "text": "Cold", "icon": 2355 }
  ]
}
```

Graph success response:

```json
{
  "frames": [
    { "text": "Bern 12.4°", "icon": null },
    { "text": "Cold", "icon": 2355 },
    { "index": 1, "chartData": [0, 1, 2, 3] }
  ]
}
```

### Health Endpoint

```text
GET /health
```

Success response:

```json
{
  "status": "ok"
}
```

## Data Flow

1. Client calls `GET /?city=bern&graph=true`.
2. Route validates and normalizes query parameters.
3. Application service calls Aare Guru client with `{ city: "bern" }`.
4. Aare Guru client performs the upstream HTTP request.
5. Aare Guru client parses and minimally validates the upstream response.
6. Application service passes normalized data to the LaMetric formatter.
7. Formatter returns a valid `frames` object.
8. Route returns JSON with the proper HTTP status.

## Testing Strategy

### Unit Tests

Unit-test pure logic without network access:

1. Request validation.
2. LaMetric text frame formatting.
3. Chart sampling and scaling.
4. Equal min/max chart behavior.
5. Missing or malformed upstream data handling.
6. Error mapping.

### Integration Tests

Integration-test the Express app with a fake Aare Guru client:

1. Valid non-graph request.
2. Valid graph request.
3. Missing city.
4. Invalid graph value.
5. Upstream timeout.
6. Upstream invalid JSON.

### Black-Box Test

Keep one black-box test that starts the real server and calls the live endpoint.

This validates the deployed wiring but should not be the only test, because live upstream tests can fail for reasons outside this codebase.

## Operational Concerns

### Logging

Log at least:

1. Request path and normalized query values.
2. Upstream request duration.
3. Upstream errors.
4. Unexpected exceptions.

Avoid logging excessive response bodies.

### Timeouts

The upstream request should have an explicit timeout.

Without a timeout, slow upstream behavior can tie up server resources and create poor LaMetric client behavior.

### Caching

A short in-memory cache can reduce upstream calls.

Recommended initial policy:

1. Cache by city.
2. Use a small TTL, for example 30 to 60 seconds.
3. Cache only successful upstream responses.
4. Keep caching optional and simple because the service is stateless across instances.

### Rate Limiting

Rate limiting is optional for a small app, but useful if the service is public.

Potential policies:

1. Basic per-IP request limit.
2. Platform-level rate limiting if available.
3. No rate limiting initially, but monitor request volume.

### Deployment

The service can remain a single stateless web process.

Recommended environment variables:

```text
PORT
AARE_GURU_BASE_URL
UPSTREAM_TIMEOUT_MS
CACHE_TTL_SECONDS
LOG_LEVEL
```

## Migration Plan

1. Add `src/app.js` and `src/server.js` while keeping the existing route behavior.
2. Extract `processData` into a formatter module with unit tests.
3. Extract upstream HTTP access into an Aare Guru client.
4. Add request validation and structured JSON errors.
5. Add a health endpoint.
6. Replace `request-promise-native` with a maintained HTTP client or built-in `fetch`.
7. Add optional short TTL caching.
8. Keep the existing black-box test to protect end-to-end behavior.

## Target Architecture Summary

The target architecture remains small and stateless, but separates HTTP routing, upstream access, transformation, validation, and error handling. This preserves the simplicity of the current service while making it easier to test, operate, and evolve.
