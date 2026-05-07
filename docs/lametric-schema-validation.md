# LaMetric Schema Validation

LaMetric does not publish a formal JSON Schema for this response shape. The local schema in
`schemas/lametric-response.schema.json` is based on the documented frame format from LaMetric's
My Data DIY and Indicator App documentation.

## Sources

LaMetric My Data DIY documents that the response must be JSON with a top-level `frames` array.
It also documents simple frames, goal frames, spike-chart frames, a 1-20 frame count, `text`,
`icon`, `duration`, `goalData`, and `chartData`.

LaMetric's First Indicator App guide shows the same `frames` response shape for indicator app
push and poll integrations.

## Local Validation

Validate the current service responses by starting the service locally through the validator:

```bash
npm run validate:schema
```

By default this validates:

```text
http://127.0.0.1:3400/?city=bern&graph=false
http://127.0.0.1:3400/?city=bern&graph=true
```

## Validate Any Endpoint

The same validator can check any endpoint that returns a LaMetric frame response:

```bash
npm run validate:schema -- "https://example.com/lametric.json"
```

The script fetches the endpoint, parses the JSON response, and validates it with AJV against
`schemas/lametric-response.schema.json`.
