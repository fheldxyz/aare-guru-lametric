"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { spawn } = require("child_process");
const Ajv = require("ajv");

const schemaPath = path.join(__dirname, "..", "schemas", "lametric-response.schema.json");
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

const localPort = process.env.SCHEMA_VALIDATE_PORT || "3400";
const localBaseUrl = `http://127.0.0.1:${localPort}`;
const defaultUrls = [
  `${localBaseUrl}/?city=bern&graph=false`,
  `${localBaseUrl}/?city=bern&graph=true`,
];

function getJson(url) {
  const client = url.startsWith("https:") ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.get(url, (res) => {
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
          reject(new Error(`Expected JSON from ${url}, got: ${body}`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(10000, () => {
      req.destroy(new Error(`Request timed out: ${url}`));
    });
  });
}

async function waitForLocalServer(url) {
  let lastError;

  for (let i = 0; i < 40; i++) {
    try {
      await getJson(url);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw lastError || new Error("Local service did not start");
}

function assertValidResponse(url, response) {
  assert.strictEqual(response.statusCode, 200, `${url} returned ${response.statusCode}`);

  if (!validate(response.body)) {
    const details = ajv.errorsText(validate.errors, { separator: "\n" });
    throw new Error(`${url} does not match LaMetric schema:\n${details}`);
  }
}

async function validateUrls(urls) {
  for (const url of urls) {
    const response = await getJson(url);
    assertValidResponse(url, response);
    console.log(`valid ${url}`);
  }
}

async function run() {
  const urls = process.argv.slice(2);

  if (urls.length > 0) {
    await validateUrls(urls);
    return;
  }

  const server = spawn(process.execPath, ["index.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PORT: localPort,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });

  let stderr = "";
  server.stderr.on("data", (data) => {
    stderr += data.toString();
  });

  try {
    await waitForLocalServer(defaultUrls[0]);
    await validateUrls(defaultUrls);
  } finally {
    server.kill();
  }

  if (server.exitCode && server.exitCode !== 0) {
    throw new Error(`Local service exited unexpectedly: ${stderr}`);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
