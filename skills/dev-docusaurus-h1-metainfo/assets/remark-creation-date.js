const { execSync } = require('child_process');
const path = require('path');

function getGitCreationDate(filePath) {
  try {
    // Find git root directory
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      cwd: path.dirname(filePath),
      encoding: 'utf8',
    }).trim();

    // Get relative path from git root
    const relativePath = path.relative(gitRoot, filePath);

    // Get the first commit timestamp for this file
    // Uses --all to search across all branches (supports worktrees and feature branches)
    // Uses --follow to track file renames
    const output = execSync(
      `git log --all --follow --format=%at --reverse -n 1 -- "${relativePath}"`,
      {
        cwd: gitRoot,
        encoding: 'utf8',
      },
    ).trim();

    const timestamp = output.split('\n')[0];

    if (!timestamp) {
      return null;
    }

    const date = new Date(parseInt(timestamp) * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return {
      formatted: `${year}/${month}/${day}`,
      timestamp: date.getTime(),
    };
  } catch (error) {
    console.warn(`Could not extract creation date for ${filePath}: ${error.message}`);
    return null;
  }
}

// Remark plugin to inject creation date into frontmatter
function remarkCreationDate() {
  return async (tree, vfile) => {
    const filePath = vfile.history[0];
    if (!filePath) return;

    const creationDate = getGitCreationDate(filePath);
    if (creationDate) {
      vfile.data = vfile.data || {};
      vfile.data.frontMatter = vfile.data.frontMatter || {};
      vfile.data.frontMatter.custom_creation_date = creationDate.formatted;
      vfile.data.frontMatter.custom_creation_timestamp = creationDate.timestamp;
    }
  };
}

module.exports = remarkCreationDate;
