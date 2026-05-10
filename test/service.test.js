"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const { test } = require("node:test");
const Ajv = require("ajv");

const {
  buildAareGuruUrl,
  buildChartData,
  createAareGuruClient,
  createApp,
  parseBoolean,
  parseCity,
  processData,
} = require("../index");
const schema = require("../schemas/lametric-response.schema.json");

function createAareFixture(overrides) {
  return {
    aare: {
      temperature: 12.4,
      location: "Bärn",
      temperature_text: "Uschaflig chaut",
    },
    aarepast: Array.from({ length: 259 }, (_, index) => ({
      temperature: 10 + index / 100,
    })),
    ...(overrides || {}),
  };
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
}

function requestJson(server, path) {
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}${path}`;

  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = "";

        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve({
              statusCode: res.statusCode,
              body: JSON.parse(body),
            });
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

test("builds an encoded Aare Guru URL", () => {
  const url = buildAareGuruUrl("https://example.test/current", "Bern & Thun");

  assert.equal(url.searchParams.get("city"), "Bern & Thun");
  assert.equal(url.searchParams.get("app"), "xyz.fheld.lametric.aaretemperatur");
  assert.equal(url.searchParams.get("version"), "1.1");
});

test("validates city and graph query values", () => {
  assert.equal(parseCity(" bern "), "bern");
  assert.equal(parseBoolean(undefined, false), false);
  assert.equal(parseBoolean("true", false), true);
  assert.equal(parseBoolean("false", true), false);
  assert.throws(() => parseCity(""), /city is required/);
  assert.throws(() => parseBoolean("yes", false), /graph must be either true or false/);
});

test("formats non-graph LaMetric responses without requiring history", () => {
  const response = processData(createAareFixture({ aarepast: undefined }), false);

  assert.deepEqual(response, {
    frames: [
      { text: "Bärn 12.4°", icon: null },
      { text: "Uschaflig chaut", icon: 2355 },
    ],
  });
});

test("formats graph responses with valid chart data", () => {
  const response = processData(createAareFixture(), true);
  const graphFrame = response.frames[2];

  assert.equal(response.frames.length, 3);
  assert.equal(graphFrame.index, 1);
  assert.ok(Array.isArray(graphFrame.chartData));
  assert.ok(graphFrame.chartData.every((value) => Number.isInteger(value)));
  assert.ok(graphFrame.chartData.every((value) => value >= 0 && value <= 8));
});

test("handles flat chart data without NaN/null values", () => {
  const chartData = buildChartData(Array.from({ length: 259 }, () => ({ temperature: 12.4 })));

  assert.ok(chartData.length > 0);
  assert.ok(chartData.every((value) => value === 4));
});

test("formatted responses match the stored LaMetric schema", () => {
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(schema);

  assert.equal(validate(processData(createAareFixture(), false)), true);
  assert.equal(validate(processData(createAareFixture(), true)), true);
});

test("HTTP route returns LaMetric JSON and validation errors", async () => {
  const app = createApp({
    logging: false,
    aareGuruClient: {
      async getCurrent() {
        return createAareFixture();
      },
    },
  });
  const server = await listen(app);

  try {
    const ok = await requestJson(server, "/?city=bern&graph=true");
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.body.frames.length, 3);

    const invalidGraph = await requestJson(server, "/?city=bern&graph=yes");
    assert.equal(invalidGraph.statusCode, 400);
    assert.equal(invalidGraph.body.error.message, "graph must be either true or false");

    const missingCity = await requestJson(server, "/?graph=false");
    assert.equal(missingCity.statusCode, 400);
    assert.equal(missingCity.body.error.message, "city is required");
  } finally {
    await close(server);
  }
});

test("Aare Guru client caches successful upstream responses", async () => {
  let requestCount = 0;
  const upstream = http.createServer((req, res) => {
    requestCount += 1;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(createAareFixture()));
  });
  await new Promise((resolve) => upstream.listen(0, resolve));

  try {
    const port = upstream.address().port;
    const client = createAareGuruClient({
      baseUrl: `http://127.0.0.1:${port}/current`,
      cacheTtlMs: 60 * 1000,
      log: () => {},
    });

    await client.getCurrent("bern");
    await client.getCurrent("bern");

    assert.equal(requestCount, 1);
  } finally {
    await close(upstream);
  }
});
