#!/usr/bin/env node
/**
 * admin-server.js
 * Local admin backend for Christopher Cook Photography
 *
 * Usage:
 *   1. Copy .env.example to .env and fill in your values
 *   2. node admin-server.js
 *   3. Open http://localhost:3131 in your browser
 *
 * No npm packages required — uses only Node.js built-ins.
 */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

// ── Load .env ──────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('ERROR: .env file not found. Copy .env.example to .env and fill in your values.');
    process.exit(1);
  }
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq < 0) return;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key) process.env[key] = val;
  });
}
loadEnv();

const SUPABASE_URL      = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const BUCKET            = 'site-images';
const PORT              = parseInt(process.env.PORT || '3131', 10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
  process.exit(1);
}

// ── Supabase REST helpers ──────────────────────────────────────────────────
function sbRequest(method, urlStr, bodyObj, extraHeaders) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const body   = bodyObj !== undefined ? JSON.stringify(bodyObj) : null;

    const headers = {
      'apikey':        SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type':  'application/json',
      ...extraHeaders,
    };
    if (body) headers['Content-Length'] = Buffer.byteLength(body);

    const req = https.request({
      hostname: parsed.hostname,
      port:     parsed.port || 443,
      path:     parsed.pathname + parsed.search,
      method,
      headers,
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function sbBinaryUpload(storagePath, buffer, mimeType) {
  return new Promise((resolve, reject) => {
    const uploadUrl = new URL(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`);
    const headers = {
      'apikey':          SUPABASE_SERVICE_KEY,
      'Authorization':   `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type':    mimeType,
      'Content-Length':  buffer.length,
      'x-upsert':        'true',
    };

    const req = https.request({
      hostname: uploadUrl.hostname,
      port:     uploadUrl.port || 443,
      path:     uploadUrl.pathname,
      method:   'POST',
      headers,
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

// ── Route handlers ─────────────────────────────────────────────────────────

// GET /api/images  → return all rows from site_images
async function handleGetImages(res) {
  try {
    const result = await sbRequest(
      'GET',
      `${SUPABASE_URL}/rest/v1/site_images?select=*`,
      undefined
    );
    jsonResponse(res, 200, result.body || []);
  } catch (err) {
    jsonResponse(res, 500, { error: err.message });
  }
}

// POST /api/upload  → { slot, filename, base64, mimeType }
async function handleUpload(req, res) {
  const body = await readBody(req);
  let payload;
  try { payload = JSON.parse(body); }
  catch { return jsonResponse(res, 400, { error: 'Invalid JSON' }); }

  const { slot, filename, base64, mimeType } = payload;
  if (!slot || !base64) return jsonResponse(res, 400, { error: 'Missing slot or base64' });

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > 30 * 1024 * 1024) {
    return jsonResponse(res, 400, { error: 'File exceeds 30 MB limit' });
  }

  const ext         = (filename || 'image.jpg').split('.').pop().toLowerCase();
  const storagePath = `${slot}/${Date.now()}.${ext}`;
  const mime        = mimeType || 'image/jpeg';

  // Remove existing file if any
  try {
    const existing = await sbRequest(
      'GET',
      `${SUPABASE_URL}/rest/v1/site_images?select=storage_path&slot=eq.${encodeURIComponent(slot)}`,
      undefined
    );
    const rows = existing.body;
    if (Array.isArray(rows) && rows.length && rows[0].storage_path) {
      await sbRequest(
        'DELETE',
        `${SUPABASE_URL}/storage/v1/object/${BUCKET}`,
        { prefixes: [rows[0].storage_path] }
      );
    }
  } catch (_) { /* non-fatal */ }

  // Upload binary to Supabase Storage
  const uploadResult = await sbBinaryUpload(storagePath, buffer, mime);
  if (uploadResult.status >= 300) {
    return jsonResponse(res, 502, { error: 'Storage upload failed', detail: uploadResult.body });
  }

  // Public URL
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;

  // Upsert into site_images table
  const dbResult = await sbRequest(
    'POST',
    `${SUPABASE_URL}/rest/v1/site_images?on_conflict=slot`,
    { slot, url: publicUrl, storage_path: storagePath, alt: slot },
    { 'Prefer': 'resolution=merge-duplicates,return=minimal' }
  );

  if (dbResult.status >= 300) {
    return jsonResponse(res, 502, { error: 'DB upsert failed', detail: dbResult.body });
  }

  jsonResponse(res, 200, { url: publicUrl, storage_path: storagePath });
}

// POST /api/remove  → { slot }
async function handleRemove(req, res) {
  const body = await readBody(req);
  let payload;
  try { payload = JSON.parse(body); }
  catch { return jsonResponse(res, 400, { error: 'Invalid JSON' }); }

  const { slot } = payload;
  if (!slot) return jsonResponse(res, 400, { error: 'Missing slot' });

  // Fetch storage_path first
  try {
    const existing = await sbRequest(
      'GET',
      `${SUPABASE_URL}/rest/v1/site_images?select=storage_path&slot=eq.${encodeURIComponent(slot)}`,
      undefined
    );
    const rows = existing.body;
    if (Array.isArray(rows) && rows.length && rows[0].storage_path) {
      await sbRequest(
        'DELETE',
        `${SUPABASE_URL}/storage/v1/object/${BUCKET}`,
        { prefixes: [rows[0].storage_path] }
      );
    }
  } catch (_) { /* non-fatal */ }

  // Delete DB row
  const dbResult = await sbRequest(
    'DELETE',
    `${SUPABASE_URL}/rest/v1/site_images?slot=eq.${encodeURIComponent(slot)}`,
    undefined
  );

  if (dbResult.status >= 300) {
    return jsonResponse(res, 502, { error: 'DB delete failed', detail: dbResult.body });
  }

  jsonResponse(res, 200, { ok: true });
}

// ── HTTP server ────────────────────────────────────────────────────────────
function jsonResponse(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type':  'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const ADMIN_HTML = path.join(__dirname, 'admin-local.html');

const server = http.createServer(async (req, res) => {
  const parsed  = url.parse(req.url);
  const pathname = parsed.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }

  // Serve admin UI
  if (req.method === 'GET' && (pathname === '/' || pathname === '/admin')) {
    if (!fs.existsSync(ADMIN_HTML)) {
      res.writeHead(404); return res.end('admin-local.html not found');
    }
    const html = fs.readFileSync(ADMIN_HTML);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': html.length });
    return res.end(html);
  }

  // API routes
  if (pathname === '/api/images' && req.method === 'GET') {
    return handleGetImages(res);
  }
  if (pathname === '/api/upload' && req.method === 'POST') {
    return handleUpload(req, res);
  }
  if (pathname === '/api/remove' && req.method === 'POST') {
    return handleRemove(req, res);
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Image Manager running at http://localhost:${PORT}\n`);
  console.log(`  Connected to: ${SUPABASE_URL}`);
  console.log(`  Bucket: ${BUCKET}`);
  console.log(`\n  Press Ctrl+C to stop.\n`);
});
