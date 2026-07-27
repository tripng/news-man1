// playwright.config.js
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  use: {
    // 1. Memastikan browser terbuka (tidak berjalan di background)
    headless: false,

    // 2. Mematikan batasan ukuran bawaan Playwright
    viewport: null,

    // 3. Memberikan perintah ke browser untuk buka secara full screen
    launchOptions: {
      args: ["--start-maximized"],
    },
  },
});
