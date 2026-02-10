#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const content = process.argv[2];
let filename = process.argv[3];

// Replace timestamp placeholders
const now = new Date();
const timestamp = ('0' + (now.getMonth() + 1)).slice(-2) + ('0' + now.getDate()).slice(-2) + '_' + 
                 ('0' + now.getHours()).slice(-2) + ('0' + now.getMinutes()).slice(-2);
const date = now.getFullYear() + ('0' + (now.getMonth() + 1)).slice(-2) + ('0' + now.getDate()).slice(-2);
const time = ('0' + now.getHours()).slice(-2) + ('0' + now.getMinutes()).slice(-2);
const datetime = date + '_' + time;

filename = filename.replace('{timestamp}', timestamp)
                  .replace('{date}', date)
                  .replace('{time}', time)
                  .replace('{datetime}', datetime);

// Ensure directory exists
const dir = path.dirname(filename);
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

// Write file
fs.writeFileSync(filename, content, 'utf8');
console.log('File saved to:', filename);
