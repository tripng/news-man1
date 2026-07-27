const { Octokit } = require("@octokit/rest");
const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = require("../config/env");

const octokit = new Octokit({ auth: GITHUB_TOKEN });

async function uploadToGitHub(base64Image, path, message) {
  await octokit.repos.createOrUpdateFileContents({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    path: path,
    message: message,
    content: base64Image,
  });

  return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/refs/heads/main/${path}`;
}

module.exports = { uploadToGitHub };
