const path = require("path");
const os = require("os");

// Server configuration
const DEV_SERVER_URL = "http://claude.localhost:9987";
const SERVER_START_TIMEOUT_MS = 60000;
const SERVER_POLL_INTERVAL_MS = 500;
const HTTP_REQUEST_TIMEOUT_MS = 1000;
const SERVER_PORT = 9987;

// Window dimensions
const MAIN_WINDOW = {
  width: 1400,
  height: 900,
};

const SPLASH_WINDOW = {
  width: 400,
  height: 200,
};

// Paths
const CONFIG_DIR = path.join(os.homedir(), ".config", "claude-code-doc");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
const DEFAULT_PROJECT_PATH = path.join(os.homedir(), ".claude", "doc");

// Shell environment - common package manager locations
const ADDITIONAL_PATH_ENTRIES = [
  // Homebrew
  "/opt/homebrew/bin",
  "/usr/local/bin",
  // nodenv/anyenv
  path.join(os.homedir(), ".anyenv/envs/nodenv/shims"),
  path.join(os.homedir(), ".nodenv/shims"),
  // nvm
  path.join(os.homedir(), ".nvm/versions/node"),
  // volta
  path.join(os.homedir(), ".volta/bin"),
  // pnpm global
  path.join(os.homedir(), "Library/pnpm"),
  path.join(os.homedir(), ".local/share/pnpm"),
];

module.exports = {
  DEV_SERVER_URL,
  SERVER_START_TIMEOUT_MS,
  SERVER_POLL_INTERVAL_MS,
  HTTP_REQUEST_TIMEOUT_MS,
  SERVER_PORT,
  MAIN_WINDOW,
  SPLASH_WINDOW,
  CONFIG_DIR,
  CONFIG_PATH,
  DEFAULT_PROJECT_PATH,
  ADDITIONAL_PATH_ENTRIES,
};
