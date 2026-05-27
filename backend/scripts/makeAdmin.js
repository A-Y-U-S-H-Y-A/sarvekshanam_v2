#!/usr/bin/env node
'use strict';

/**
 * CLI tool: promote a user account to admin role.
 *
 * Usage:
 *   node scripts/makeAdmin.js <username>
 *
 * Example:
 *   node scripts/makeAdmin.js alice
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { getDb, closeDb } = require('../src/db/database');

const username = process.argv[2];

if (!username) {
  console.error('❌  Usage: node scripts/makeAdmin.js <username>');
  process.exit(1);
}

async function run() {
  try {
    const db = getDb();
    
    const user = await db.User.findOne({ where: { username } });

    if (!user) {
      console.error(`❌  User "${username}" not found in the database.`);
      process.exit(1);
    }

    if (user.role === 'admin') {
      console.log(`ℹ️  User "${username}" is already an admin.`);
      process.exit(0);
    }

    await user.update({ role: 'admin' });

    console.log(`✅  User "${username}" has been promoted to admin.`);
  } catch (err) {
    console.error('❌  Database error:', err.message);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

run();
