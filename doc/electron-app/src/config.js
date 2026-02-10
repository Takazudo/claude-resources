const { app, dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const { CONFIG_PATH, CONFIG_DIR, DEFAULT_PROJECT_PATH } = require("./constants");

/**
 * Save the project path to config file
 * @param {string} projectPath - Path to save
 */
function saveProjectPath(projectPath) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ projectPath }, null, 2));
  } catch (e) {
    console.error("Error saving config:", e);
  }
}

/**
 * Prompt user to select project directory
 * @returns {Promise<string|null>} Selected path or null if cancelled
 */
async function promptForProjectPath() {
  const result = await dialog.showOpenDialog({
    title: "Select Claude Code Doc Directory",
    message: "Please select the ~/.claude/doc folder",
    properties: ["openDirectory"],
    buttonLabel: "Select Project",
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const selectedPath = result.filePaths[0];

  // Validate it looks like the right project
  const packageJsonPath = path.join(selectedPath, "site", "package.json");
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      if (pkg.name === "claude-code-doc-site") {
        saveProjectPath(selectedPath);
        return selectedPath;
      }
    } catch (e) {
      // Not valid package.json
    }
  }

  // Show error and retry
  const retry = await dialog.showMessageBox({
    type: "error",
    title: "Invalid Project",
    message: "The selected folder does not appear to be the Claude Code Doc project.",
    detail: "Please select the folder containing the doc/site/package.json file.",
    buttons: ["Try Again", "Cancel"],
    defaultId: 0,
  });

  if (retry.response === 0) {
    return promptForProjectPath();
  }

  return null;
}

/**
 * Get the project root directory
 * In development: uses relative path from electron-app
 * In packaged mode: checks config file, then default path, then prompts user
 * @returns {Promise<string|null>} Absolute path to project root, or null if not found
 */
async function getProjectRoot() {
  // In development, use relative path
  if (!app.isPackaged) {
    return path.join(__dirname, "..", "..");
  }

  // In packaged mode, check config file first
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
      if (config.projectPath && fs.existsSync(config.projectPath)) {
        return config.projectPath;
      }
    }
  } catch (e) {
    console.error("Error reading config:", e);
  }

  // Check default path
  if (fs.existsSync(DEFAULT_PROJECT_PATH)) {
    return DEFAULT_PROJECT_PATH;
  }

  // Prompt user to select project directory
  return promptForProjectPath();
}

module.exports = {
  getProjectRoot,
  saveProjectPath,
  promptForProjectPath,
};
