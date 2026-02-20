#!/usr/bin/env node

/**
 * JLCPCB Database Query Script
 *
 * Usage:
 *   node query.js list-categories [keyword]
 *   node query.js search-parts <category_id> [keyword] [limit]
 *   node query.js search-all <keyword> [limit]
 *   node query.js lookup <lcsc_number>
 *   node query.js db-info
 *
 * Examples:
 *   node query.js list-categories
 *   node query.js list-categories "audio"
 *   node query.js search-parts 208 "3.5" 10
 *   node query.js search-all "CH340" 10
 *   node query.js lookup C12345
 *   node query.js db-info
 */

import Database from 'better-sqlite3';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, statSync } from 'fs';

const args = process.argv.slice(2);
const command = args[0];

// Find database
const dbPath = join(homedir(), '.jlcpcb-db', 'cache.sqlite3');

if (!existsSync(dbPath)) {
  console.error('ERROR: Database not found at', dbPath);
  console.error('Run /jlcpcb-component-finder-update-db to download it.');
  process.exit(1);
}

// Connect to database
const db = new Database(dbPath, { readonly: true });

function formatPart(r, categoryInfo) {
  const partNumber = `C${r.lcsc}`;
  const url = `https://jlcpcb.com/partdetail/${partNumber}`;
  const tags = [];
  if (r.basic) tags.push('Basic');
  if (r.preferred) tags.push('Preferred');
  const tagStr = tags.length ? ` [${tags.join(', ')}]` : '';
  const catStr = categoryInfo ? ` | ${categoryInfo}` : '';
  const priceStr = r.price ? ` | Price: ${formatPrice(r.price)}` : '';

  console.log(`${partNumber}: ${r.mfr} - ${r.description || 'No description'} (${r.package}, Stock: ${r.stock})${tagStr}${catStr}${priceStr}`);
  if (r.datasheet) {
    console.log(`   Datasheet: ${r.datasheet}`);
  }
  console.log(`   → ${url}`);
}

function formatPrice(priceStr) {
  try {
    const prices = JSON.parse(priceStr);
    if (Array.isArray(prices) && prices.length > 0) {
      return prices.map(p => `${p.qFrom}+: $${Number(p.price).toFixed(4)}`).join(', ');
    }
  } catch {
    // not JSON, return as-is
  }
  return priceStr;
}

try {
  if (command === 'list-categories') {
    const keyword = args[1] || '';
    let categories;

    if (keyword) {
      categories = db
        .prepare(
          `SELECT id, category, subcategory FROM categories
           WHERE category LIKE ? OR subcategory LIKE ?
           ORDER BY category, subcategory`
        )
        .all(`%${keyword}%`, `%${keyword}%`);
    } else {
      categories = db
        .prepare('SELECT id, category, subcategory FROM categories ORDER BY category, subcategory')
        .all();
    }

    if (categories.length === 0) {
      console.log('No categories found');
    } else {
      categories.forEach(c => {
        console.log(`${c.id}: ${c.category} > ${c.subcategory}`);
      });
      console.log(`\n${categories.length} categories found`);
    }

  } else if (command === 'search-parts') {
    const categoryId = parseInt(args[1]);
    const keyword = args[2] || '';
    const limit = parseInt(args[3]) || 20;

    if (isNaN(categoryId)) {
      console.error('ERROR: category_id must be a number');
      process.exit(1);
    }

    let query, params;

    if (keyword) {
      query = `SELECT lcsc, mfr, description, package, stock, basic, preferred, price, datasheet
               FROM components
               WHERE category_id = ? AND (mfr LIKE ? OR description LIKE ?)
               ORDER BY stock DESC LIMIT ?`;
      params = [categoryId, `%${keyword}%`, `%${keyword}%`, limit];
    } else {
      query = `SELECT lcsc, mfr, description, package, stock, basic, preferred, price, datasheet
               FROM components
               WHERE category_id = ?
               ORDER BY stock DESC LIMIT ?`;
      params = [categoryId, limit];
    }

    const results = db.prepare(query).all(...params);

    if (results.length === 0) {
      console.log('No results found');
    } else {
      results.forEach(r => formatPart(r));
      console.log(`\n${results.length} results`);
    }

  } else if (command === 'search-all') {
    const keyword = args[1];
    const limit = parseInt(args[2]) || 20;

    if (!keyword) {
      console.error('ERROR: keyword is required for search-all');
      console.error('Usage: node query.js search-all <keyword> [limit]');
      process.exit(1);
    }

    const results = db
      .prepare(
        `SELECT c.lcsc, c.mfr, c.description, c.package, c.stock,
                c.basic, c.preferred, c.price, c.datasheet,
                cat.category, cat.subcategory
         FROM components c
         JOIN categories cat ON c.category_id = cat.id
         WHERE c.mfr LIKE ? OR c.description LIKE ? OR CAST(c.lcsc AS TEXT) LIKE ?
         ORDER BY c.stock DESC LIMIT ?`
      )
      .all(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, limit);

    if (results.length === 0) {
      console.log('No results found');
    } else {
      results.forEach(r => formatPart(r, `${r.category} > ${r.subcategory}`));
      console.log(`\n${results.length} results`);
    }

  } else if (command === 'lookup') {
    let lcscId = args[1];
    if (!lcscId) {
      console.error('ERROR: LCSC number is required');
      console.error('Usage: node query.js lookup <lcsc_number>');
      process.exit(1);
    }

    // Strip C prefix if present
    lcscId = lcscId.replace(/^C/i, '');

    const result = db
      .prepare(
        `SELECT c.lcsc, c.mfr, c.description, c.package, c.stock,
                c.basic, c.preferred, c.price, c.datasheet, c.joints,
                c.last_update,
                cat.category, cat.subcategory
         FROM components c
         JOIN categories cat ON c.category_id = cat.id
         WHERE c.lcsc = ?`
      )
      .get(parseInt(lcscId));

    if (!result) {
      console.log(`Part C${lcscId} not found in database`);
    } else {
      formatPart(result, `${result.category} > ${result.subcategory}`);
      console.log(`   Joints: ${result.joints}`);
      if (result.last_update) {
        console.log(`   Last updated: ${new Date(result.last_update * 1000).toISOString().split('T')[0]}`);
      }
    }

  } else if (command === 'db-info') {
    const totalParts = db.prepare('SELECT COUNT(*) as count FROM components').get().count;
    const totalCategories = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
    const basicParts = db.prepare('SELECT COUNT(*) as count FROM components WHERE basic = 1').get().count;
    const preferredParts = db.prepare('SELECT COUNT(*) as count FROM components WHERE preferred = 1').get().count;
    const inStock = db.prepare('SELECT COUNT(*) as count FROM components WHERE stock > 0').get().count;
    const dbStat = statSync(dbPath);
    const dbSizeMB = (dbStat.size / 1024 / 1024).toFixed(0);

    console.log('JLCPCB Parts Database Info');
    console.log('─'.repeat(40));
    console.log(`Database path:   ${dbPath}`);
    console.log(`Database size:   ${dbSizeMB} MB`);
    console.log(`Total parts:     ${totalParts.toLocaleString()}`);
    console.log(`Total categories: ${totalCategories}`);
    console.log(`Basic parts:     ${basicParts.toLocaleString()}`);
    console.log(`Preferred parts: ${preferredParts.toLocaleString()}`);
    console.log(`In stock:        ${inStock.toLocaleString()}`);
    console.log(`DB modified:     ${dbStat.mtime.toISOString().split('T')[0]}`);

  } else {
    console.error('Unknown command:', command);
    console.error('');
    console.error('Usage:');
    console.error('  node query.js list-categories [keyword]');
    console.error('  node query.js search-parts <category_id> [keyword] [limit]');
    console.error('  node query.js search-all <keyword> [limit]');
    console.error('  node query.js lookup <lcsc_number>');
    console.error('  node query.js db-info');
    process.exit(1);
  }

} catch (error) {
  console.error('ERROR:', error.message);
  process.exit(1);
} finally {
  db.close();
}
