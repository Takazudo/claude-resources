#!/usr/bin/env node

/**
 * JLCPCB Database Query Script
 *
 * Usage:
 *   node query.js list-categories
 *   node query.js search-parts <category_id> [keyword] [limit]
 *
 * Examples:
 *   node query.js list-categories
 *   node query.js search-parts 512 "12V" 10
 *   node query.js search-parts 208 "" 20
 */

import Database from 'better-sqlite3';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';

const args = process.argv.slice(2);
const command = args[0];

// Find database
const dbPath = join(homedir(), '.jlcpcb-db', 'cache.sqlite3');

if (!existsSync(dbPath)) {
  console.error('ERROR: Database not found at', dbPath);
  console.error('Please download from https://yaqwsx.github.io/jlcparts/');
  process.exit(1);
}

// Connect to database
const db = new Database(dbPath, { readonly: true });

try {
  if (command === 'list-categories') {
    // List all categories
    const categories = db
      .prepare('SELECT id, category, subcategory FROM categories ORDER BY category, subcategory')
      .all();

    categories.forEach(c => {
      console.log(`${c.id}: ${c.category} > ${c.subcategory}`);
    });

  } else if (command === 'search-parts') {
    // Search parts
    const categoryId = parseInt(args[1]);
    const keyword = args[2] || '';
    const limit = parseInt(args[3]) || 20;

    if (isNaN(categoryId)) {
      console.error('ERROR: category_id must be a number');
      process.exit(1);
    }

    let query, params;

    if (keyword) {
      query = `SELECT lcsc, mfr, description, package, stock
               FROM components
               WHERE category_id = ? AND (mfr LIKE ? OR description LIKE ?)
               ORDER BY stock DESC LIMIT ?`;
      params = [categoryId, `%${keyword}%`, `%${keyword}%`, limit];
    } else {
      query = `SELECT lcsc, mfr, description, package, stock
               FROM components
               WHERE category_id = ?
               ORDER BY stock DESC LIMIT ?`;
      params = [categoryId, limit];
    }

    const results = db.prepare(query).all(...params);

    if (results.length === 0) {
      console.log('No results found');
    } else {
      results.forEach(r => {
        const partNumber = `C${r.lcsc}`;
        const url = `https://jlcpcb.com/partdetail/${partNumber}`;
        console.log(`${partNumber}: ${r.mfr} - ${r.description || 'No description'} (${r.package}, Stock: ${r.stock})`);
        console.log(`   → ${url}`);
      });
    }

  } else {
    console.error('Unknown command:', command);
    console.error('Usage: node query.js [list-categories|search-parts]');
    process.exit(1);
  }

} catch (error) {
  console.error('ERROR:', error.message);
  process.exit(1);
} finally {
  db.close();
}
