"use strict";

const assert = require("assert");
const http = require("http");
const { spawn } = require("child_process");

const port = process.env.TEST_PORT || "3100";
const baseUrl = `http://127.0.0.1:${port}`;

function requestJson(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${baseUrl}${path}`, (res) => {
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
        } catch {
          reject(new Error(`Expected JSON response, got: ${body}`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(10000, () => {
      req.destroy(new Error("Request timed out"));
    });
  });
}

async function waitForServer(retries) {
  let lastError;

  for (let i = 0; i < retries; i++) {
    try {
      await requestJson("/?city=bern&graph=false");
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw lastError || new Error("Server did not start");
}

function assertBaseFrames(response) {
  assert.strictEqual(response.statusCode, 200);
  assert.ok(Array.isArray(response.body.frames), "frames must be an array");
  assert.ok(response.body.frames.length >= 2, "response must include temperature frames");

  const [temperatureFrame, textFrame] = response.body.frames;

  assert.strictEqual(typeof temperatureFrame.text, "string");
  assert.match(temperatureFrame.text, /.+ \d+(\.\d+)?°$/);
  assert.strictEqual(temperatureFrame.icon, null);

  assert.strictEqual(typeof textFrame.text, "string");
  assert.ok(textFrame.text.length > 0, "temperature text must not be empty");
  assert.strictEqual(textFrame.icon, 2355);
}

function assertGraphFrame(frame) {
  assert.strictEqual(frame.index, 1);
  assert.ok(Array.isArray(frame.chartData), "chartData must be an array");
  assert.strictEqual(frame.chartData.length, 37);

  frame.chartData.forEach((value) => {
    assert.strictEqual(Number.isInteger(value), true);
    assert.ok(value >= 0 && value <= 8, `chart value out of range: ${value}`);
  });
}

async function run() {
  const server = spawn(process.execPath, ["index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: port,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  server.stderr.on("data", (data) => {
    stderr += data.toString();
  });

  try {
    await waitForServer(40);

    const withoutGraph = await requestJson("/?city=bern&graph=false");
    assertBaseFrames(withoutGraph);
    assert.strictEqual(withoutGraph.body.frames.length, 2);

    const withGraph = await requestJson("/?city=bern&graph=true");
    assertBaseFrames(withGraph);
    assert.strictEqual(withGraph.body.frames.length, 3);
    assertGraphFrame(withGraph.body.frames[2]);
  } finally {
    server.kill();
  }

  if (server.exitCode && server.exitCode !== 0) {
    throw new Error(`Server exited unexpectedly: ${stderr}`);
  }
}

run()
  .then(() => {
    console.log("Black-box LaMetric API test passed");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
