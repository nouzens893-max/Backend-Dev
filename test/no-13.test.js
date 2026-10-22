const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { after, before, test } = require('node:test');

const barang = [];
let nextId = 1;
let server;
let baseUrl;

const pool = {
  async execute(sql, params = []) {
    if (sql === 'SELECT 1') {
      return [[{ 1: 1 }], []];
    }
    if (sql.includes('ORDER BY id')) {
      return [barang.map((item) => ({ ...item })), []];
    }
    if (sql === 'SELECT id, nama, jumlah, lokasi FROM barang WHERE id = ?') {
      return [
        barang.filter((item) => item.id === params[0]).map((item) => ({ ...item })),
        []
      ];
    }
    if (sql === 'SELECT id FROM barang WHERE id = ?') {
      return [barang.filter((item) => item.id === params[0]).map(({ id }) => ({ id })), []];
    }
    if (sql.startsWith('INSERT INTO barang')) {
      const item = {
        id: nextId++,
        nama: params[0],
        jumlah: params[1],
        lokasi: params[2]
      };
      barang.push(item);
      return [{ insertId: item.id }, []];
    }
    if (sql.startsWith('UPDATE barang')) {
      const item = barang.find((row) => row.id === params[3]);
      if (item) {
        Object.assign(item, {
          nama: params[0],
          jumlah: params[1],
          lokasi: params[2]
        });
      }
      return [{ affectedRows: item ? 1 : 0 }, []];
    }
    if (sql.startsWith('DELETE FROM barang')) {
      const index = barang.findIndex((item) => item.id === params[0]);
      if (index === -1) {
        return [{ affectedRows: 0 }, []];
      }
      barang.splice(index, 1);
      return [{ affectedRows: 1 }, []];
    }
    throw new Error(`Query tidak terduga: ${sql}`);
  },
  async end() {}
};

const dbPath = path.resolve(__dirname, '..', 'db.js');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: pool
};

const { app } = require('../server');

function startServer() {
  return new Promise((resolve) => {
    const instance = http.createServer(app);
    instance.listen(0, '127.0.0.1', () => {
      const { port } = instance.address();
      server = instance;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

function stopServer() {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
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

before(startServer);
after(async () => {
  if (server && server.listening) {
    await stopServer();
  }
});

test('pengujian nomor 13: CRUD, validasi, error, dan restart simulasi', async () => {
  const hasil = [];
  async function catat(kasus, pathname, method, body, statusHarapan) {
    const actual = await request(pathname, method, body);
    assert.equal(actual.status, statusHarapan, kasus);
    hasil.push({ kasus, status: actual.status });
    return actual;
  }

  const post = await catat(
    'POST data valid',
    '/api/barang',
    'POST',
    JSON.stringify({ nama: 'Proyektor', jumlah: 2, lokasi: 'Lab RPL' }),
    201
  );
  const id = post.body.data.id;

  const daftar = await catat('GET semua', '/api/barang', 'GET', undefined, 200);
  assert.equal(daftar.body.data.length, 1);
  const detail = await catat(`GET ID ${id}`, `/api/barang/${id}`, 'GET', undefined, 200);
  assert.equal(detail.body.data.nama, 'Proyektor');

  const perubahan = JSON.stringify({
    nama: 'Proyektor',
    jumlah: 3,
    lokasi: 'Ruang Multimedia'
  });
  await catat(`PUT ID ${id}`, `/api/barang/${id}`, 'PUT', perubahan, 200);
  const putSama = await catat(
    `PUT nilai sama ID ${id}`,
    `/api/barang/${id}`,
    'PUT',
    perubahan,
    200
  );
  assert.equal(putSama.body.data.id, id);

  await catat(
    'POST nama kosong',
    '/api/barang',
    'POST',
    JSON.stringify({ nama: ' ', jumlah: 2, lokasi: 'Lab' }),
    400
  );
  await catat(
    'POST jumlah negatif',
    '/api/barang',
    'POST',
    JSON.stringify({ nama: 'Barang', jumlah: -1, lokasi: 'Lab' }),
    400
  );
  await catat(
    'POST jumlah berupa string',
    '/api/barang',
    'POST',
    JSON.stringify({ nama: 'Barang', jumlah: '2', lokasi: 'Lab' }),
    400
  );
  await catat(
    'POST jumlah pecahan',
    '/api/barang',
    'POST',
    JSON.stringify({ nama: 'Barang', jumlah: 1.5, lokasi: 'Lab' }),
    400
  );
  const sesudahInputTidakValid = await catat(
    'GET semua setelah POST tidak valid',
    '/api/barang',
    'GET',
    undefined,
    200
  );
  assert.equal(sesudahInputTidakValid.body.data.length, 1);

  await catat('GET ID abc', '/api/barang/abc', 'GET', undefined, 400);
  await catat('GET ID 0', '/api/barang/0', 'GET', undefined, 400);
  await catat('GET ID yang tidak ada', '/api/barang/2147483647', 'GET', undefined, 404);
  await catat(
    'PUT ID yang tidak ada',
    '/api/barang/2147483647',
    'PUT',
    perubahan,
    404
  );

  await catat(`DELETE ID ${id}`, `/api/barang/${id}`, 'DELETE', undefined, 200);
  await catat(
    `DELETE ulang ID ${id}`,
    `/api/barang/${id}`,
    'DELETE',
    undefined,
    404
  );

  const malformed = await request('/api/barang', 'POST', '{"nama":"Barang",}');
  assert.equal(malformed.status, 400, 'POST JSON dengan koma terakhir');
  assert.equal(malformed.body.message, 'JSON tidak valid');
  hasil.push({ kasus: 'POST JSON dengan koma terakhir', status: malformed.status });

  await catat('GET endpoint salah', '/alamat-salah', 'GET', undefined, 404);

  const dataPersisten = await catat(
    'POST data untuk uji restart',
    '/api/barang',
    'POST',
    JSON.stringify({ nama: 'Data restart', jumlah: 1, lokasi: 'Lab' }),
    201
  );
  const idPersisten = dataPersisten.body.data.id;
  await stopServer();
  await startServer();
  const setelahRestart = await catat(
    'GET data setelah restart simulasi',
    `/api/barang/${idPersisten}`,
    'GET',
    undefined,
    200
  );
  assert.equal(setelahRestart.body.data.nama, 'Data restart');

  console.log(`\nHasil pengujian HTTP dengan MySQL tiruan (${hasil.length} kasus):`);
  for (const item of hasil) {
    console.log(`${item.status} | ${item.kasus}`);
  }
});
