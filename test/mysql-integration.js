const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const net = require('node:net');
const path = require('node:path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const baseUrl = 'http://127.0.0.1:3000';
const prefix = `No13-${crypto.randomUUID()}`;
const database = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 2
});
let serverProcess;
let serverOutput = '';

function checkPortAvailable() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(3000, '127.0.0.1', () => {
      probe.close((error) => error ? reject(error) : resolve());
    });
  });
}

async function startServer() {
  serverOutput = '';
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  for (const stream of [serverProcess.stdout, serverProcess.stderr]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      serverOutput += chunk;
    });
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`API gagal start:\n${serverOutput}`);
    }
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.status === 200) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`API tidak siap dalam 15 detik:\n${serverOutput}`);
}

async function stopServer() {
  if (!serverProcess || serverProcess.exitCode !== null) {
    return;
  }
  const child = serverProcess;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`API tidak berhenti dengan benar:\n${serverOutput}`));
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill();
  });
  serverProcess = undefined;
}

async function request(pathname, method = 'GET', body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body === undefined
      ? {}
      : { 'content-type': 'application/json' },
    body
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : undefined
  };
}

async function expectStatus(label, pathname, method, body, expected) {
  const response = await request(pathname, method, body);
  assert.equal(response.status, expected, label);
  console.log(`${response.status} | ${label}`);
  return response;
}

async function run() {
  const body = (nama, jumlah, lokasi = 'Lab RPL') =>
    JSON.stringify({ nama, jumlah, lokasi });
  let persistentId;

  try {
    await database.execute('SELECT 1');
    await checkPortAvailable();
    await startServer();

    const created = await expectStatus(
      'POST valid',
      '/api/barang',
      'POST',
      body(`${prefix}-barang`, 2),
      201
    );
    const id = created.body.data.id;
    assert.equal(created.body.data.nama, `${prefix}-barang`);

    const list = await expectStatus('GET semua', '/api/barang', 'GET', undefined, 200);
    assert.ok(list.body.data.some((item) => item.id === id));
    const detail = await expectStatus(`GET ID ${id}`, `/api/barang/${id}`, 'GET', undefined, 200);
    assert.equal(detail.body.data.jumlah, 2);

    const updatedBody = body(`${prefix}-barang-diubah`, 3, 'Ruang Multimedia');
    const updated = await expectStatus(`PUT ID ${id}`, `/api/barang/${id}`, 'PUT', updatedBody, 200);
    assert.equal(updated.body.data.id, id);
    await expectStatus(`PUT nilai sama ID ${id}`, `/api/barang/${id}`, 'PUT', updatedBody, 200);

    const [countBeforeInvalid] = await database.execute(
      'SELECT COUNT(*) AS total FROM barang'
    );
    await expectStatus('POST nama kosong', '/api/barang', 'POST', body(' ', 2), 400);
    await expectStatus('POST jumlah negatif', '/api/barang', 'POST', body(`${prefix}-invalid`, -1), 400);
    await expectStatus('POST jumlah berupa string', '/api/barang', 'POST', body(`${prefix}-invalid`, '2'), 400);
    await expectStatus('POST jumlah pecahan', '/api/barang', 'POST', body(`${prefix}-invalid`, 1.5), 400);
    const [countAfterInvalid] = await database.execute(
      'SELECT COUNT(*) AS total FROM barang'
    );
    assert.equal(countAfterInvalid[0].total, countBeforeInvalid[0].total);
    const afterInvalid = await expectStatus(
      'GET semua setelah POST tidak valid',
      '/api/barang',
      'GET',
      undefined,
      200
    );
    assert.equal(afterInvalid.body.data.filter((item) => item.nama.startsWith(prefix)).length, 1);
    await expectStatus('GET ID abc', '/api/barang/abc', 'GET', undefined, 400);
    await expectStatus('GET ID 0', '/api/barang/0', 'GET', undefined, 400);
    await expectStatus('GET ID tidak ada', '/api/barang/2147483647', 'GET', undefined, 404);
    await expectStatus(
      'PUT ID tidak ada',
      '/api/barang/2147483647',
      'PUT',
      body('Barang', 1),
      404
    );

    const invalidJson = await request('/api/barang', 'POST', '{"nama":"Barang",}');
    assert.equal(invalidJson.status, 400);
    assert.equal(invalidJson.body.message, 'JSON tidak valid');
    console.log('400 | POST JSON tidak valid');
    await expectStatus('GET endpoint salah', '/alamat-salah', 'GET', undefined, 404);

    const persistent = await expectStatus(
      'POST data untuk uji restart',
      '/api/barang',
      'POST',
      body(`${prefix}-persisten`, 1),
      201
    );
    persistentId = persistent.body.data.id;

    await stopServer();
    await startServer();
    const afterRestart = await expectStatus(
      `GET data ID ${persistentId} setelah restart Node.js`,
      `/api/barang/${persistentId}`,
      'GET',
      undefined,
      200
    );
    assert.equal(afterRestart.body.data.nama, `${prefix}-persisten`);

    await expectStatus(`DELETE ID ${id}`, `/api/barang/${id}`, 'DELETE', undefined, 200);
    await expectStatus('GET ID setelah dihapus', `/api/barang/${id}`, 'GET', undefined, 404);
    await expectStatus(`DELETE ulang ID ${id}`, `/api/barang/${id}`, 'DELETE', undefined, 404);
    console.log('Semua tes integrasi MySQL lulus; data tetap tersedia setelah proses Node.js dimulai ulang.');
  } finally {
    await stopServer();
    await database.execute('DELETE FROM barang WHERE nama LIKE ?', [`${prefix}%`]);
    await database.end();
  }
}

run().catch((error) => {
  console.error(`Tes integrasi MySQL gagal: ${error.message}`);
  process.exitCode = 1;
});
