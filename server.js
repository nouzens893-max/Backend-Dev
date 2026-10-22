require('dotenv').config();
const express = require('express');
const pool = require('./db');
const barangRoutes = require('./routes/barang');
const app = express();

app.use(express.json());
app.get('/', (req, res) => {
  res.json({ message: 'API inventaris aktif' });
});
app.use('/api/barang', barangRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Endpoint tidak ditemukan' });
});

app.use((err, req, res, next) => {
  console.error(err.message);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'JSON tidak valid' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Body terlalu besar' });
  }
  res.status(500).json({ message: 'Terjadi kesalahan server' });
});

async function mulai() {
  try {
    await pool.execute('SELECT 1');
    app.listen(3000, '127.0.0.1', () => {
      console.log('API: http://localhost:3000');
    });
  } catch (err) {
    const code = err.code || 'ERROR';
    const detail = err.message || 'Tidak dapat terhubung ke host/port database';
    console.error(`Koneksi database gagal (${code}): ${detail}`);
    await pool.end();
    process.exitCode = 1;
  }
}

if (require.main === module) {
  mulai();
}

module.exports = { app, mulai };
