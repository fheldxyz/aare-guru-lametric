# Current Architecture

This document describes the architecture currently implemented in `index.js`.

## Purpose

The service is a small HTTP adapter between the Aare Guru API and the LaMetric app format.

It receives a LaMetric-style request, fetches current Aare river data from Aare Guru, transforms the upstream JSON into LaMetric `frames`, and returns the transformed response.

## Runtime Shape

The application is a single Node.js process with one Express server.

```text
LaMetric client
  |
  | GET /?city=<city>&graph=<true|false>
  v
Express route in index.js
  |
  | HTTPS request
  v
Aare Guru API
  |
  | JSON response
  v
processData()
  |
  | LaMetric frames JSON
  v
LaMetric client
```

## Modules and Responsibilities

All runtime responsibilities are implemented in `index.js`.

### Dependencies

`express`

Provides the HTTP server and route handling.

`request-promise-native`

Performs the outbound HTTP request to the Aare Guru API.

### Configuration

The server listens on:

```js
process.env.PORT || 3000;
```

This supports hosted environments such as Render or Heroku-style platforms that inject a `PORT` environment variable.

No other configuration is externalized.

### HTTP Interface

The service exposes one route:

```text
GET /
```

Supported query parameters:

```text
city=<city>
graph=true|false
```

`city` is forwarded directly to the upstream Aare Guru API.

`graph` controls whether the LaMetric response contains a chart frame. If omitted, the code defaults it to `false`.

### Upstream Integration

The route builds this upstream URL:

```text
https://aareguru.existenz.ch/v2018/current?city=<city>&app=xyz.fheld.lametric.aaretemperatur&version=1.1
```

The URL is constructed through string concatenation.

There is no URL encoding, input validation, timeout configuration, retry policy, or upstream response validation.

### Transformation Flow

The route passes the raw upstream response body into:

```js
processData(body, withgraph);
```

`processData` performs these steps:

1. Parses the raw JSON body.
2. Reads the current temperature, location, and temperature text from `aaredata.aare`.
3. Builds a temperature display string as `<location> <temperature>°`.
4. Reads historical temperature data from `aaredata.aarepast`.
5. Samples up to 37 data points by taking every seventh historical item.
6. Converts sampled temperatures into integer chart values scaled from `0` to `8`.
7. Returns a LaMetric response object.

For `graph=false`, the response contains two frames:

```json
{
  "frames": [
    { "text": "<location> <temperature>°", "icon": null },
    { "text": "<temperature_text>", "icon": 2355 }
  ]
}
```

For `graph=true`, the response contains a third chart frame:

```json
{
  "index": 1,
  "chartData": [0, 1, 2]
}
```

In practice, `chartData` is intended to contain 37 scaled values.

## Error Handling

All route errors are handled by a single catch block:

```js
res.send("error was caught");
```

Current behavior:

1. The HTTP status remains `200 OK`.
2. The response is plain text, not JSON.
3. The original error is not logged.
4. The client cannot distinguish upstream failures, invalid input, transformation bugs, or malformed upstream data.

## Testing

The repository now includes a black-box integration test in `test/blackbox.test.js`.

That test starts `index.js`, calls the public HTTP route, and validates the response shape for both `graph=false` and `graph=true`.

The test intentionally does not import or refactor application code.

## Architectural Characteristics

### Strengths

1. Small surface area.
2. Low operational complexity.
3. Easy to deploy as a single Node.js process.
4. Clear adapter purpose.
5. No persistent state.

### Limitations

1. Routing, upstream access, data transformation, and server startup are tightly coupled in one file.
2. `processData` cannot be unit-tested directly without importing `index.js`, which would also start the server.
3. The upstream request has no explicit timeout.
4. Query parameters are not validated.
5. Upstream URLs are built with string concatenation.
6. Errors are hidden behind a generic success-status text response.
7. The graph scaling can produce invalid values if all sampled temperatures are equal because `max - min` becomes zero.
8. Missing or short `aarepast` data can produce `undefined` or invalid chart values.
9. There is no health endpoint.
10. There is no structured logging or request tracing.
11. The project declares old Node and npm engine versions.
12. The `request` ecosystem is deprecated.

## Deployment Model

The app is designed to be deployed as a stateless web service.

The README says it is hosted on Render and was previously hosted on Heroku.

The app depends on:

1. A Node.js runtime.
2. Network access to `https://aareguru.existenz.ch`.
3. A platform-provided `PORT` value, or local port `3000`.

## Data Ownership

The service does not own data. It only translates live upstream API data into the LaMetric format.

There is no database, cache, queue, file storage, or background job.

## Current Architecture Summary

The current architecture is a minimal synchronous request-response adapter. It is appropriate for a small hobby-scale integration, but it has limited fault tolerance, observability, and test isolation.
