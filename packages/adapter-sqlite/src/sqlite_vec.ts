import * as sqliteVec from 'sqlite-vec';
import type { Database } from 'better-sqlite3';
import { elizaLogger } from '@elizaos/core';
import path from 'path';
import fs from 'fs';

// Loads the sqlite-vec extensions into the provided SQLite database
export function loadVecExtensions(db: Database): void {
  try {
    // Use the exact path from the shell output
    const vecPath = '/app/node_modules/.pnpm/sqlite-vec-linux-x64@0.1.6/node_modules/sqlite-vec-linux-x64/vec0.so';
    elizaLogger.debug(`Attempting to load sqlite-vec extension from: ${vecPath}`);
    if (!fs.existsSync(vecPath)) {
      elizaLogger.error(`sqlite-vec-linux-x64 binary not found at: ${vecPath}`);
      throw new Error(`sqlite-vec-linux-x64 binary not found at: ${vecPath}`);
    }
    // Load sqlite-vec extensions
    db.loadExtension(vecPath);
    elizaLogger.log('sqlite-vec extensions loaded successfully.');
  } catch (error) {
    elizaLogger.error('Failed to load sqlite-vec extensions:', error);
    throw error;
  }
}

/**
 * @param db - An instance of better-sqlite3 Database
 */
export function load(db: Database): void {
  loadVecExtensions(db);
}