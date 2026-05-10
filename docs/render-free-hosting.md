# Render Free Hosting Notes

This service is designed to run as a stateless Render Web Service on the Free instance type.

## Runtime

Render's current default Node.js version for newly created Node services is Node 24. The project
also declares this explicitly in `package.json`:

```json
"engines": {
  "node": ">=24 <25",
  "npm": ">=10 <12"
}
```

The upper bound is intentional. Render recommends upper-bounded Node ranges so a future major Node
release does not silently change production behavior.

## Free Instance Constraints

Render Free web services spin down after 15 minutes without inbound traffic. They spin back up on
the next request, which can take about one minute.

The service should therefore:

1. Remain stateless.
2. Use Render's `PORT` environment variable.
3. Treat in-memory cache as optional optimization only.
4. Avoid relying on local filesystem writes.
5. Keep startup fast.

## Cache Policy

The service uses a small in-memory cache for successful Aare Guru responses.

Default:

```text
TTL: 60 seconds
Key: normalized city name
```

This reduces service-initiated outbound traffic to Aare Guru, which is useful on Render Free because
Render can suspend services that initiate unusually high public internet traffic.

Because Free services can restart or spin down at any time, the cache is deliberately not used as a
durable store. Losing the cache is safe.

## Logging

Logs are written as one JSON object per line to stdout/stderr so they work with Render log streams.

Logged events include:

1. Server startup.
2. Aare Guru request success.
3. Cache hits.
4. Stale-cache fallback.
5. Request success/failure.

## Sources

1. Render Node version docs: https://render.com/docs/node-version
2. Render Free instance docs: https://render.com/docs/free
3. Render Web Services docs: https://render.com/docs/web-services/
