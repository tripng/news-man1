// Entry point: muat gambar dari folder img/, lalu jalankan automation().
const fs = require("fs");
const path = require("path");
const { automation } = require("./index");

function loadImagesFromFolder(folder) {
  const exts = [".jpg", ".jpeg", ".png", ".webp"];
  const files = fs
    .readdirSync(folder)
    .filter((f) => exts.includes(path.extname(f).toLowerCase()))
    .sort(); // urut alphabet agar konsisten

  return files.map((f) => {
    const abs = path.join(folder, f);
    const buffer = fs.readFileSync(abs);
    return {
      filename: f,
      url: `file://${abs}`,
      buffer,
    };
  });
}

// Hanya jalan saat dijalankan langsung (`node run.js`), bukan saat di-require
// (misalnya oleh `npm test` yang hanya ingin mengecek syntax/load).
if (require.main === module) {
  (async () => {
    try {
      const imgDir = path.join(__dirname, "img");
      const images = loadImagesFromFolder(imgDir);

      if (images.length === 0) {
        console.error(`Tidak ada gambar di folder ${imgDir}`);
        process.exit(1);
      }

      console.log(`Memuat ${images.length} gambar dari ${imgDir}`);
      await automation(images);
      console.log("Selesai.");
    } catch (err) {
      console.error("Terjadi error:", err);
      process.exit(1);
    }
  })();
}
