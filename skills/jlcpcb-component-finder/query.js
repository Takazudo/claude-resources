#!/usr/bin/env node

/**
 * JLCPCB Database Query Script
 *
 * Targets the yaqwsx/jlcparts "source-db-v2" schema (tables: jlc_components,
 * lcsc_components, meta). Everything the finder needs lives denormalized in
 * jlc_components (category/subcategory/manufacturer are plain text columns;
 * tier is library_type 'base'/'expand'; there is no separate categories table).
 *
 * Usage:
 *   node query.js list-categories [keyword]
 *   node query.js search-parts <category> [keyword] [limit]   # category is a NAME substring
 *   node query.js search-all <keyword> [limit]
 *   node query.js lookup <lcsc_number>
 *   node query.js db-info
 *
 * Examples:
 *   node query.js list-categories "audio"
 *   node query.js search-parts "Audio" "3.5" 10
 *   node query.js search-all "CH340" 10
 *   node query.js lookup C12345
 *   node query.js db-info
 *
 * Override the DB path with the JLCPCB_DB_PATH env var (defaults to ~/.jlcpcb-db/cache.sqlite3).
 */

import Database from 'better-sqlite3';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, statSync } from 'fs';

const args = process.argv.slice(2);
const command = args[0];

// Find database (env override wins, e.g. for testing a freshly downloaded DB)
const dbPath = process.env.JLCPCB_DB_PATH || join(homedir(), '.jlcpcb-db', 'cache.sqlite3');

if (!existsSync(dbPath)) {
  console.error('ERROR: Database not found at', dbPath);
  console.error('Run /jlcpcb-component-finder-update-db to download it.');
  process.exit(1);
}

// Connect to database
const db = new Database(dbPath, { readonly: true });

// Common column projection; library_type -> basic (1/0) to keep the old output shape.
const COLS = `lcsc, mfr, description, package, stock,
              (library_type = 'base') AS basic, preferred, price, datasheet,
              category, subcategory`;

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
  // v2 format: "1-999:0.0077,1000-3999:0.0065,...,100000-:0.0051"
  try {
    const tiers = priceStr.split(',').map(s => {
      const [range, price] = s.split(':');
      return `${range}: $${Number(price).toFixed(4)}`;
    });
    const shown = tiers.slice(0, 3).join(', ');
    return tiers.length > 3 ? `${shown}, …` : shown;
  } catch {
    return priceStr;
  }
}

try {
  if (command === 'list-categories') {
    const keyword = args[1] || '';
    let rows;

    if (keyword) {
      rows = db
        .prepare(
          `SELECT category, subcategory, COUNT(*) AS cnt FROM jlc_components
           WHERE category LIKE ? OR subcategory LIKE ?
           GROUP BY category, subcategory
           ORDER BY category, subcategory`
        )
        .all(`%${keyword}%`, `%${keyword}%`);
    } else {
      rows = db
        .prepare(
          `SELECT category, subcategory, COUNT(*) AS cnt FROM jlc_components
           GROUP BY category, subcategory
           ORDER BY category, subcategory`
        )
        .all();
    }

    if (rows.length === 0) {
      console.log('No categories found');
    } else {
      rows.forEach(c => {
        console.log(`${c.category} > ${c.subcategory} (${c.cnt.toLocaleString()} parts)`);
      });
      console.log(`\n${rows.length} categories found`);
    }

  } else if (command === 'search-parts') {
    const category = args[1];
    const keyword = args[2] || '';
    const limit = parseInt(args[3]) || 20;

    if (!category) {
      console.error('ERROR: category is required (a category/subcategory name substring)');
      console.error('Usage: node query.js search-parts <category> [keyword] [limit]');
      console.error('Tip: run list-categories to see available names.');
      process.exit(1);
    }

    let query, params;
    const catClause = '(category LIKE ? OR subcategory LIKE ?)';

    if (keyword) {
      query = `SELECT ${COLS}
               FROM jlc_components
               WHERE ${catClause} AND (mfr LIKE ? OR description LIKE ?)
               ORDER BY stock DESC LIMIT ?`;
      params = [`%${category}%`, `%${category}%`, `%${keyword}%`, `%${keyword}%`, limit];
    } else {
      query = `SELECT ${COLS}
               FROM jlc_components
               WHERE ${catClause}
               ORDER BY stock DESC LIMIT ?`;
      params = [`%${category}%`, `%${category}%`, limit];
    }

    const results = db.prepare(query).all(...params);

    if (results.length === 0) {
      console.log('No results found');
    } else {
      results.forEach(r => formatPart(r, `${r.category} > ${r.subcategory}`));
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
        `SELECT ${COLS}
         FROM jlc_components
         WHERE mfr LIKE ? OR description LIKE ? OR CAST(lcsc AS TEXT) LIKE ?
         ORDER BY stock DESC LIMIT ?`
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
        `SELECT ${COLS}, joints, fetched_at
         FROM jlc_components
         WHERE lcsc = ?`
      )
      .get(parseInt(lcscId));

    if (!result) {
      console.log(`Part C${lcscId} not found in database`);
    } else {
      formatPart(result, `${result.category} > ${result.subcategory}`);
      console.log(`   Joints: ${result.joints}`);
      if (result.fetched_at) {
        console.log(`   Data fetched: ${new Date(result.fetched_at * 1000).toISOString().split('T')[0]}`);
      }
    }

  } else if (command === 'db-info') {
    const totalParts = db.prepare('SELECT COUNT(*) as count FROM jlc_components').get().count;
    const totalCategories = db
      .prepare("SELECT COUNT(*) as count FROM (SELECT DISTINCT category, subcategory FROM jlc_components)")
      .get().count;
    const basicParts = db.prepare("SELECT COUNT(*) as count FROM jlc_components WHERE library_type = 'base'").get().count;
    const preferredParts = db.prepare('SELECT COUNT(*) as count FROM jlc_components WHERE preferred = 1').get().count;
    const inStock = db.prepare('SELECT COUNT(*) as count FROM jlc_components WHERE stock > 0').get().count;
    const dataDate = db.prepare('SELECT MAX(fetched_at) as t FROM jlc_components').get().t;
    const dbStat = statSync(dbPath);
    const dbSizeMB = (dbStat.size / 1024 / 1024).toFixed(0);

    console.log('JLCPCB Parts Database Info');
    console.log('─'.repeat(40));
    console.log(`Database path:    ${dbPath}`);
    console.log(`Database size:    ${dbSizeMB} MB`);
    console.log(`Total parts:      ${totalParts.toLocaleString()}`);
    console.log(`Total categories: ${totalCategories.toLocaleString()}`);
    console.log(`Basic parts:      ${basicParts.toLocaleString()}`);
    console.log(`Preferred parts:  ${preferredParts.toLocaleString()}`);
    console.log(`In stock:         ${inStock.toLocaleString()}`);
    if (dataDate) {
      console.log(`Data fetched:     ${new Date(dataDate * 1000).toISOString().split('T')[0]}`);
    }
    console.log(`File modified:    ${dbStat.mtime.toISOString().split('T')[0]}`);

  } else {
    console.error('Unknown command:', command);
    console.error('');
    console.error('Usage:');
    console.error('  node query.js list-categories [keyword]');
    console.error('  node query.js search-parts <category> [keyword] [limit]');
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
