CREATE DATABASE IF NOT EXISTS inventaris_smk
  CHARACTER SET utf8mb4;

USE inventaris_smk;

CREATE TABLE IF NOT EXISTS barang (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(100) NOT NULL,
  jumlah INT NOT NULL CHECK (jumlah >= 0),
  lokasi VARCHAR(100) NOT NULL
);

DESCRIBE barang;
SELECT * FROM barang;

CREATE USER IF NOT EXISTS 'inventaris_app'@'localhost'
  IDENTIFIED BY 'GantiPasswordLab123!';
GRANT SELECT, INSERT, UPDATE, DELETE
  ON inventaris_smk.* TO 'inventaris_app'@'localhost';
