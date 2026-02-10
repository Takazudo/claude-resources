// @ts-check

// Load generated sidebar data
let claudeSidebar = [];

try {
  claudeSidebar = require("./src/data/claude-sidebar.json");
} catch {
  claudeSidebar = ["claude/index"];
}

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  claudeSidebar,
};

module.exports = sidebars;
