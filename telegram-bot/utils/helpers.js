function generateFileInfo() {
  const date = new Date();
  const tz = "Asia/Makassar"; // Waktu WITA

  const formatter = new Intl.DateTimeFormat("id-ID", {
    timeZone: tz,
    year: "numeric",
    month: "short",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const p = {};
  parts.forEach((part) => (p[part.type] = part.value));

  const filename = `${p.day}-${p.weekday.toLowerCase()}-${p.hour}${p.minute}${p.second}.jpg`;
  const path = `${p.year}/${p.month.toLowerCase()}/${filename}`;

  return { path, filename };
}

function parseMetadata(text) {
  const parsedData = { title: "", tags: "", category: "" };
  const lines = text.split("\n");

  lines.forEach((line) => {
    const [key, ...valueArr] = line.split(":");
    if (!key || valueArr.length === 0) return;

    const val = valueArr.join(":").trim();
    const k = key.trim().toLowerCase();

    if (k === "title") parsedData.title = val;
    else if (k === "kategori") parsedData.category = val;
    else if (k === "tag") {
      parsedData.tags = val
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => (t.startsWith("#") ? t : `#${t}`))
        .join(",");
    }
  });

  return parsedData;
}

function escapeHTML(str) {
  if (!str && str !== 0) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

module.exports = { generateFileInfo, parseMetadata, escapeHTML };
