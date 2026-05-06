"use strict";

const assert = require("assert");
const { processData } = require("./index");

const fixture = JSON.stringify({
  aare: {
    temperature: 13.4,
    location: "Bern",
    temperature_text: "Wassertemperatur",
  },
  aarepast: Array.from({ length: 37 }, (_, i) => ({
    temperature: 10 + i * 0.1,
  })),
});

const result = processData(fixture, "false");

assert.deepStrictEqual(result, {
  frames: [
    { text: "Bern 13.4°", icon: null },
    { text: "Wassertemperatur", icon: 2355 },
  ],
});

console.log("processData output matches the expected Lametric payload.");
