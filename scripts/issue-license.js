#!/usr/bin/env node
/**
 * CommitCraft License Key Issuer
 * 
 * Usage:
 *   node issue-license.js --email user@example.com --tier personal [--expiry 2027-12-31]
 * 
 * The private key is read from ~/.commitcraft-keys/signing-private-key.b64
 * Output is the license key string to send to the customer.
 * 
 * KEEP THIS FILE AND THE PRIVATE KEY OFF PUBLIC REPOSITORIES.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    args[argv[i].replace('--', '')] = argv[i + 1];
  }
  return args;
}

function emailHash(email) {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 16);
}

function issueKey({ email, tier = 'personal', expiry = 'perpetual' }) {
  // Load private key
  const keyPath = path.join(os.homedir(), '.commitcraft-keys', 'signing-private-key.b64');
  if (!fs.existsSync(keyPath)) {
    throw new Error(`Private key not found at ${keyPath}`);
  }
  const privDer = Buffer.from(fs.readFileSync(keyPath, 'utf-8').trim(), 'base64');
  const privateKey = crypto.createPrivateKey({ key: privDer, format: 'der', type: 'pkcs8' });

  // Build payload
  const payload = {
    emailHash: emailHash(email),
    expiry,
    tier,
  };
  const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf-8');

  // Sign
  const signature = crypto.sign(null, payloadBytes, privateKey);

  // Encode as two base64url segments joined by "."
  const key = payloadBytes.toString('base64url') + '.' + signature.toString('base64url');
  return key;
}

const args = parseArgs(process.argv);

if (!args.email) {
  console.error('Usage: node issue-license.js --email user@example.com [--tier personal|team] [--expiry 2027-12-31|perpetual]');
  process.exit(1);
}

try {
  const key = issueKey({
    email: args.email,
    tier: args.tier || 'personal',
    expiry: args.expiry || 'perpetual',
  });
  console.log('License key:');
  console.log(key);
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
