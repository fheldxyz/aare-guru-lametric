"use strict";

const express = require("express");

const DEFAULT_PORT = 3000;
const DEFAULT_UPSTREAM_TIMEOUT_MS = 3000;
const DEFAULT_CACHE_TTL_MS = 60 * 1000;
const DEFAULT_AARE_GURU_BASE_URL = "https://aareguru.existenz.ch/v2018/current";
const LAMETRIC_APP_ID = "xyz.fheld.lametric.aaretemperatur";
const LAMETRIC_APP_VERSION = "1.1";

function createLogger(enabled) {
  return function log(level, message, context) {
    if (!enabled) {
      return;
    }

    const entry = {
      level: level,
      message: message,
      time: new Date().toISOString(),
      ...(context || {}),
    };

    const writer = level === "error" || level === "warn" ? console.error : console.log;
    writer(JSON.stringify(entry));
  };
}

function parseBoolean(value, defaultValue) {
  if (value === undefined) {
    return defaultValue;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  var error = new Error("graph must be either true or false");
  error.statusCode = 400;
  throw error;
}

function parseCity(value) {
  if (typeof value !== "string" || value.trim() === "") {
    var error = new Error("city is required");
    error.statusCode = 400;
    throw error;
  }

  var city = value.trim();
  if (city.length > 80) {
    var lengthError = new Error("city is too long");
    lengthError.statusCode = 400;
    throw lengthError;
  }

  return city;
}

function buildAareGuruUrl(baseUrl, city) {
  var url = new URL(baseUrl);
  url.searchParams.set("city", city);
  url.searchParams.set("app", LAMETRIC_APP_ID);
  url.searchParams.set("version", LAMETRIC_APP_VERSION);
  return url;
}

function validateAareGuruData(data, withGraph) {
  if (!data || typeof data !== "object" || !data.aare || typeof data.aare !== "object") {
    throw new Error("Invalid Aare Guru response: missing aare object");
  }

  if (typeof data.aare.temperature !== "number") {
    throw new Error("Invalid Aare Guru response: missing numeric temperature");
  }

  if (typeof data.aare.location !== "string") {
    throw new Error("Invalid Aare Guru response: missing location");
  }

  if (typeof data.aare.temperature_text !== "string") {
    throw new Error("Invalid Aare Guru response: missing temperature text");
  }

  if (withGraph && !Array.isArray(data.aarepast)) {
    throw new Error("Invalid Aare Guru response: missing aarepast history");
  }
}

function buildChartData(aarepast) {
  var sampledTemperatures = [];
  var end = Math.min(7 * 37, aarepast.length);

  for (let i = 0; i < Math.floor(end / 7); i++) {
    var temperature = aarepast[7 * i] && aarepast[7 * i].temperature;
    if (typeof temperature === "number" && Number.isFinite(temperature)) {
      sampledTemperatures.push(Math.round(100 * temperature));
    }
  }

  if (sampledTemperatures.length === 0) {
    return [0];
  }

  var min = Math.min(...sampledTemperatures);
  var max = Math.max(...sampledTemperatures);

  if (max === min) {
    return sampledTemperatures.map(() => 4);
  }

  return sampledTemperatures.map((temperature) =>
    Math.round(((temperature - min) * 8) / (max - min))
  );
}

function processData(data, withGraph) {
  validateAareGuruData(data, withGraph);

  var temperatureText = data.aare.location + " " + data.aare.temperature.toString() + "°";
  var frames = [
    { text: temperatureText, icon: null },
    { text: data.aare.temperature_text, icon: 2355 },
  ];

  if (withGraph) {
    frames.push({ index: 1, chartData: buildChartData(data.aarepast) });
  }

  return { frames: frames };
}

function createAareGuruClient(options) {
  var baseUrl = options.baseUrl || DEFAULT_AARE_GURU_BASE_URL;
  var timeoutMs = options.timeoutMs || DEFAULT_UPSTREAM_TIMEOUT_MS;
  var cacheTtlMs = options.cacheTtlMs || DEFAULT_CACHE_TTL_MS;
  var log = options.log || createLogger(true);
  var cache = new Map();

  return {
    async getCurrent(city) {
      var cacheKey = city.toLowerCase();
      var now = Date.now();
      var cached = cache.get(cacheKey);

      if (cached && cached.expiresAt > now) {
        log("info", "aare_guru_cache_hit", { city: city });
        return cached.data;
      }

      var url = buildAareGuruUrl(baseUrl, city);
      var startedAt = Date.now();

      try {
        var response = await fetch(url, {
          signal: AbortSignal.timeout(timeoutMs),
          headers: {
            "user-agent": "aare-guru-lametric/2.0",
          },
        });

        if (!response.ok) {
          throw new Error("Aare Guru returned HTTP " + response.status);
        }

        var data = await response.json();
        cache.set(cacheKey, {
          data: data,
          expiresAt: Date.now() + cacheTtlMs,
        });
        log("info", "aare_guru_request_ok", {
          city: city,
          durationMs: Date.now() - startedAt,
        });
        return data;
      } catch (error) {
        if (cached) {
          log("warn", "aare_guru_request_failed_using_stale_cache", {
            city: city,
            error: error.message,
          });
          return cached.data;
        }

        error.statusCode = error.name === "TimeoutError" ? 504 : 502;
        throw error;
      }
    },
  };
}

function createApp(options) {
  var app = express();
  var settings = options || {};
  var log = settings.log || createLogger(settings.logging !== false);
  var aareGuruClient =
    settings.aareGuruClient ||
    createAareGuruClient({
      baseUrl: settings.aareGuruBaseUrl,
      timeoutMs: settings.upstreamTimeoutMs,
      cacheTtlMs: settings.cacheTtlMs,
      log: log,
    });

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/", async (req, res) => {
    var startedAt = Date.now();

    try {
      var city = parseCity(req.query.city);
      var withGraph = parseBoolean(req.query.graph, false);
      var upstreamData = await aareGuruClient.getCurrent(city);
      var response = processData(upstreamData, withGraph);

      log("info", "lametric_request_ok", {
        city: city,
        graph: withGraph,
        durationMs: Date.now() - startedAt,
      });

      res.json(response);
    } catch (error) {
      var statusCode = error.statusCode || 500;
      log(statusCode >= 500 ? "error" : "warn", "lametric_request_failed", {
        statusCode: statusCode,
        error: error.message,
        durationMs: Date.now() - startedAt,
      });

      res.status(statusCode).json({
        error: {
          message: statusCode >= 500 ? "upstream service unavailable" : error.message,
        },
      });
    }
  });

  return app;
}

if (require.main === module) {
  var app = createApp();
  var port = process.env.PORT || DEFAULT_PORT;

  app.listen(port, () => {
    createLogger(true)("info", "server_started", { port: Number(port) });
  });
}

module.exports = {
  buildAareGuruUrl,
  buildChartData,
  createAareGuruClient,
  createApp,
  parseBoolean,
  parseCity,
  processData,
};
