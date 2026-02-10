const { ADDITIONAL_PATH_ENTRIES } = require("./constants");

/**
 * Build shell environment with common package manager paths
 * @returns {Object} Environment variables with extended PATH
 */
function getShellEnv() {
  const currentPath = process.env.PATH || "";
  const newPath = [...ADDITIONAL_PATH_ENTRIES, currentPath].join(":");

  return {
    ...process.env,
    PATH: newPath,
  };
}

/**
 * Get the user's default shell
 * @returns {string} Path to shell executable
 */
function getShell() {
  return process.env.SHELL || "/bin/bash";
}

module.exports = {
  getShellEnv,
  getShell,
};
