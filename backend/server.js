require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const { Pool } = require("pg");
const ExcelJS = require("exceljs");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Konfigurasi Database (Connection Pooling)
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  max: 20, // Membatasi jumlah koneksi agar RAM server mandiri tidak over-commit
  idleTimeoutMillis: 30000,
});

pool.connect((err, client, release) => {
  if (err)
    return console.error("❌ Gagal terkoneksi ke PostgreSQL:", err.stack);
  console.log("✅ Terhubung ke database PostgreSQL");
  release();
});

// Endpoint untuk menambahkan transaksi baru dari Web
app.post("/api/transactions", async (req, res) => {
  const { tipe, nominal, keterangan } = req.body;

  // Validasi Input Dasar
  if (!tipe || !nominal || !keterangan) {
    return res
      .status(400)
      .json({ status: "error", message: "Data tidak lengkap" });
  }

  try {
    const insertQuery = `
      INSERT INTO transactions (tipe, nominal, keterangan) 
      VALUES ($1, $2, $3) RETURNING *
    `;
    await pool.query(insertQuery, [
      tipe.toLowerCase(),
      parseFloat(nominal),
      keterangan,
    ]);

    res
      .status(201)
      .json({ status: "success", message: "Transaksi berhasil dicatat" });
  } catch (err) {
    console.error("Database Error:", err);
    res
      .status(500)
      .json({ status: "error", message: "Terjadi kesalahan sistem" });
  }
});

// Endpoint untuk mengambil riwayat & saldo
app.get("/api/transactions", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM transactions ORDER BY waktu_input DESC LIMIT 50",
    );
    const summary = await pool.query(`
      SELECT 
          COALESCE(SUM(CASE WHEN tipe = 'masuk' THEN nominal ELSE 0 END), 0) AS total_masuk,
          COALESCE(SUM(CASE WHEN tipe = 'keluar' THEN nominal ELSE 0 END), 0) AS total_keluar
      FROM transactions
    `);

    res.json({
      status: "success",
      data: result.rows,
      summary: summary.rows[0],
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Internal Server Error" });
  }
});

// Endpoint untuk menghapus transaksi berdasarkan ID
app.delete("/api/transactions/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const deleteQuery = "DELETE FROM transactions WHERE id = $1 RETURNING *";
    const result = await pool.query(deleteQuery, [id]);

    // Jika id tidak ditemukan di database
    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Transaksi tidak ditemukan" });
    }

    res.json({ status: "success", message: "Transaksi berhasil dihapus" });
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ status: "error", message: "Internal Server Error" });
  }
});

// Endpoint Ekspor Excel
app.get("/api/export-excel", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM transactions ORDER BY waktu_input DESC",
    );
    const transactions = result.rows;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Laporan Keuangan");

    // Definisi Kolom
    worksheet.columns = [
      { header: "Waktu", key: "waktu", width: 25 },
      { header: "Tipe", key: "tipe", width: 15 },
      { header: "Keterangan", key: "keterangan", width: 35 },
      { header: "Nominal", key: "nominal", width: 20 },
    ];

    // Format Header (Bold)
    worksheet.getRow(1).font = { bold: true };

    // Tambah Data & Styling
    transactions.forEach((trx) => {
      const row = worksheet.addRow({
        waktu: new Date(trx.waktu_input),
        tipe: trx.tipe.toUpperCase(),
        keterangan: trx.keterangan,
        nominal: parseFloat(trx.nominal),
      });

      row.getCell("waktu").numFmt = "dd/mm/yyyy hh:mm";
      row.getCell("waktu").alignment = { horizontal: "left" };

      const color = trx.tipe === "masuk" ? "008000" : "FF0000";
      row.getCell("nominal").font = { color: { argb: color }, bold: true };
      row.getCell("nominal").numFmt = '"Rp" #,##0';
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=Laporan_Keuangan.xlsx",
    );

    await workbook.xlsx.write(res);
    res.end(); // Ini yang penting agar loading browser berhenti dan file terunduh
  } catch (err) {
    console.error(err);
    res.status(500).send("Gagal menghasilkan Excel");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 REST API berjalan di http://localhost:${PORT}`);
});
