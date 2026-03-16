#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { getLogDir } from './get-logdir.js';

// Get arguments
const [, , filePath, content] = process.argv;

if (!filePath || !content) {
  console.error('Usage: save-file.js <filepath> <content>');
  process.exit(1);
}

// Replace placeholders
const now = new Date();
const replacements = {
  '{timestamp}': now
    .toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    .replace(/[/:]/g, '')
    .replace(', ', '_')
    .replace(' ', ''),
  '{date}': now.toISOString().split('T')[0].replace(/-/g, ''),
  '{time}': now.toTimeString().split(' ')[0].substring(0, 5).replace(':', ''),
  '{datetime}': now.toISOString().replace(/[-:T]/g, '').split('.')[0],
};

// Lazy: only compute logdir when the placeholder is actually used
if (filePath.includes('{logdir}')) {
  replacements['{logdir}'] = getLogDir();
}

let processedPath = filePath;
for (const [placeholder, value] of Object.entries(replacements)) {
  processedPath = processedPath.replaceAll(placeholder, value);
}

// Ensure directory exists
const dir = path.dirname(processedPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// Avoid collisions: if file exists, append -2, -3, etc. before the extension
if (fs.existsSync(processedPath)) {
  const ext = path.extname(processedPath);
  const base = processedPath.slice(0, -ext.length || undefined);
  let counter = 2;
  while (fs.existsSync(`${base}-${counter}${ext}`)) {
    counter++;
  }
  processedPath = `${base}-${counter}${ext}`;
}

// Write the file
fs.writeFileSync(processedPath, content, 'utf8');
console.log(`File saved to: ${processedPath}`);
