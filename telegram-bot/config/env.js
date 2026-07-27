require("dotenv").config({ override: true });

module.exports = {
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  GITHUB_OWNER: process.env.GITHUB_OWNER,
  GITHUB_REPO: process.env.GITHUB_REPO,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  ZAI_API_KEY: process.env.ZAI_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
};
