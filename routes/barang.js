const express = require('express');
const pool = require('../db');
const router = express.Router();

router.param('id', (req, res, next, value) => {
  const id = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(id)
      || id < 1 || id > 2147483647) {
    return res.status(400).json({ message: 'ID tidak valid' });
  }
  req.barangId = id;
  next();
});

function validasiBarang(req, res, next) {
  const { nama, jumlah, lokasi } = req.body || {};
  if (typeof nama !== 'string' || !nama.trim()
      || nama.trim().length > 100) {
    return res.status(400).json({
      message: 'Nama wajib diisi, maksimal 100 karakter'
    });
  }
  if (!Number.isInteger(jumlah) || jumlah < 0
      || jumlah > 2147483647) {
    return res.status(400).json({
      message: 'Jumlah harus bilangan bulat 0-2147483647'
    });
  }
  if (typeof lokasi !== 'string' || !lokasi.trim()
      || lokasi.trim().length > 100) {
    return res.status(400).json({
      message: 'Lokasi wajib diisi, maksimal 100 karakter'
    });
  }
  req.barang = { nama: nama.trim(), jumlah, lokasi: lokasi.trim() };
  next();
}

router.get('/', async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT id, nama, jumlah, lokasi FROM barang ORDER BY id'
  );
  res.json({ data: rows });
});

router.get('/:id', async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT id, nama, jumlah, lokasi FROM barang WHERE id = ?',
    [req.barangId]
  );
  if (rows.length === 0) {
    return res.status(404).json({
      message: 'Barang tidak ditemukan'
    });
  }
  res.json({ data: rows[0] });
});

router.post('/', validasiBarang, async (req, res) => {
  const { nama, jumlah, lokasi } = req.barang;
  const [result] = await pool.execute(
    'INSERT INTO barang (nama, jumlah, lokasi) VALUES (?, ?, ?)',
    [nama, jumlah, lokasi]
  );
  res.status(201).json({
    message: 'Barang berhasil ditambahkan',
    data: { id: result.insertId, nama, jumlah, lokasi }
  });
});

router.put('/:id', validasiBarang, async (req, res) => {
  const id = req.barangId;
  const { nama, jumlah, lokasi } = req.barang;
  const [rows] = await pool.execute(
    'SELECT id FROM barang WHERE id = ?', [id]
  );
  if (rows.length === 0) {
    return res.status(404).json({
      message: 'Barang tidak ditemukan'
    });
  }
  await pool.execute(
    'UPDATE barang SET nama = ?, jumlah = ?, lokasi = ? WHERE id = ?',
    [nama, jumlah, lokasi, id]
  );
  res.json({
    message: 'Barang berhasil diperbarui',
    data: { id, nama, jumlah, lokasi }
  });
});

router.delete('/:id', async (req, res) => {
  const [result] = await pool.execute(
    'DELETE FROM barang WHERE id = ?', [req.barangId]
  );
  if (result.affectedRows === 0) {
    return res.status(404).json({
      message: 'Barang tidak ditemukan'
    });
  }
  res.json({ message: 'Barang berhasil dihapus' });
});

module.exports = router;
