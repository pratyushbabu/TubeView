import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { app } from "../src/app.js";

let server;
let baseUrl;

const request = ({ method = "GET", path = "/", body, headers = {} }) =>
  new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const url = new URL(path, baseUrl);

    const req = http.request(
      {
        method,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        headers: {
          ...(payload && {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          }),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];

        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const json = text ? JSON.parse(text) : null;
          resolve({ statusCode: res.statusCode, headers: res.headers, json });
        });
      }
    );

    req.on("error", reject);

    if (payload) {
      req.write(payload);
    }

    req.end();
  });

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("healthcheck returns JSON API status", async () => {
  const response = await request({ path: "/api/v1/healthcheck" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json.success, true);
  assert.equal(response.json.message, "OK");
});

test("unknown routes return JSON 404 errors", async () => {
  const response = await request({ path: "/does-not-exist" });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json.success, false);
  assert.match(response.json.message, /Route not found/);
});

test("registration validates missing fields before database work", async () => {
  const response = await request({
    method: "POST",
    path: "/api/v1/user/register",
    body: {},
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json.success, false);
  assert.equal(response.json.message, "All fields are required");
  assert.deepEqual(response.json.errors, [
    "fullName",
    "email",
    "username",
    "password",
  ]);
});

test("protected video upload route requires authentication", async () => {
  const response = await request({
    method: "POST",
    path: "/api/v1/videos",
    body: {
      title: "A video",
      description: "A description",
    },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json.success, false);
  assert.equal(response.json.message, "Unauthorized request");
});
