#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get arguments
const [,, filePath, content] = process.argv;

if (!filePath || !content) {
  console.error('Usage: save-file.js <filepath> <content>');
  process.exit(1);
}

// Replace placeholders
const now = new Date();
const replacements = {
  '{timestamp}': now.toLocaleString('en-US', { 
    month: '2-digit', 
    day: '2-digit', 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: false 
  }).replace(/[/:]/g, '').replace(', ', '_').replace(' ', ''),
  '{date}': now.toISOString().split('T')[0].replace(/-/g, ''),
  '{time}': now.toTimeString().split(' ')[0].substring(0, 5).replace(':', ''),
  '{datetime}': now.toISOString().replace(/[-:T]/g, '').split('.')[0]
};

let processedPath = filePath;
for (const [placeholder, value] of Object.entries(replacements)) {
  processedPath = processedPath.replace(placeholder, value);
}

// Ensure directory exists
const dir = path.dirname(processedPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// Write the file
fs.writeFileSync(processedPath, content, 'utf8');
console.log(`File saved to: ${processedPath}`);
