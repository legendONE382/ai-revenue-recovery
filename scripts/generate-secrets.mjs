#!/usr/bin/env node
// Prints fresh random secrets for .env. Run: node scripts/generate-secrets.mjs
import crypto from "node:crypto";

const lines = [
  `TOKEN_ENCRYPTION_KEY=${crypto.randomBytes(32).toString("base64")}`,
  `CRON_SECRET=${crypto.randomBytes(32).toString("base64url")}`,
  `PUBSUB_VERIFICATION_TOKEN=${crypto.randomBytes(24).toString("base64url")}`,
];
console.log("# Paste into .env / your host's environment settings. Back up TOKEN_ENCRYPTION_KEY safely.\n");
console.log(lines.join("\n"));
