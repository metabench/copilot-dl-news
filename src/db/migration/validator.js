/**
 * Data Validator
 *
 * Validates data integrity after migrations, checking foreign keys,
 * row counts, and data consistency.
 */

class DataValidator {
  constructor(db) {
    if (!db) {
      throw new Error('DataValidator requires an open better-sqlite3 Database');
    }
    this.db = db;
  }

  /**
   * Validate migration by comparing source manifest with target database
   * @param {Object} sourceManifest - Manifest from exported source database
   * @param {Database} targetDb - Target database to validate
   * @returns {Promise<Object>} Validation results
   */
  async validateMigration(sourceManifest, targetDb) {
    const errors = [];

    // 1. Check row counts
    for (const [tableName, meta] of Object.entries(sourceManifest.tables)) {
      if (meta.error) continue; // Skip tables that failed to export

      try {
        const targetCount = targetDb.prepare(`
          SELECT COUNT(*) AS count FROM ${tableName}
        `).get().count;

        console.log(`[Validator] Table ${tableName}: expected ${meta.row_count}, actual ${targetCount}`);

        if (targetCount !== meta.row_count) {
          errors.push({
            type: 'row_count_mismatch',
            table: tableName,
            expected: meta.row_count,
            actual: targetCount
          });
        }
      } catch (err) {
        console.log(`[Validator] Error checking table ${tableName}:`, err.message);
        errors.push({
          type: 'table_access_error',
          table: tableName,
          error: err.message
        });
      }
    }

    // 2. Check foreign key constraints
    try {
      const fkCheck = targetDb.prepare('PRAGMA foreign_key_check').all();
      if (fkCheck.length > 0) {
        errors.push({
          type: 'foreign_key_violations',
          violations: fkCheck
        });
      }
    } catch (err) {
      errors.push({
        type: 'foreign_key_check_error',
        error: err.message
      });
    }

    // 3. Run data integrity checks (skip checks for tables that don't exist yet)
    const integrityChecks = [
      {
        name: 'urls_have_http_responses',
        sql: `
          SELECT COUNT(*) AS orphaned
          FROM urls u
          LEFT JOIN http_responses hr ON hr.url_id = u.id
          WHERE hr.id IS NULL
        `,
        description: 'URLs without HTTP responses (should be 0 after migration)',
        requiresTable: 'http_responses'
      },
      {
        name: 'content_storage_has_responses',
        sql: `
          SELECT COUNT(*) AS orphaned
          FROM content_storage cs
          LEFT JOIN http_responses hr ON cs.http_response_id = hr.id
          WHERE hr.id IS NULL
        `,
        description: 'Content storage without HTTP responses (should be 0)',
        requiresTable: 'http_responses'
      },
      {
        name: 'places_have_canonical_names',
        sql: `
          SELECT COUNT(*) AS missing
          FROM places p
          LEFT JOIN place_names pn ON pn.id = p.canonical_name_id
          WHERE p.canonical_name_id IS NOT NULL AND pn.id IS NULL
        `,
        description: 'Places with invalid canonical_name_id references',
        requiresTable: 'place_names'
      }
    ];

    for (const check of integrityChecks) {
      // Skip checks that require tables not yet created in this schema version
      if (check.requiresTable) {
        try {
          targetDb.prepare(`SELECT 1 FROM ${check.requiresTable} LIMIT 1`).get();
        } catch (err) {
          // Table doesn't exist, skip this check
          continue;
        }
      }

      try {
        const result = targetDb.prepare(check.sql).get();
        if (result.orphaned > 0 || result.missing > 0) {
          errors.push({
            type: 'data_integrity',
            check: check.name,
            description: check.description,
            count: result.orphaned || result.missing
          });
        }
      } catch (err) {
        errors.push({
          type: 'integrity_check_error',
          check: check.name,
          error: err.message
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      summary: {
        tables_checked: Object.keys(sourceManifest.tables).length,
        errors_found: errors.length,
        source_version: sourceManifest.schema_version,
        exported_at: sourceManifest.exported_at
      }
    };
  }

  // Debug method to throw validation result as error
  throwValidationResult(sourceManifest, targetDb) {
    const result = this.validateMigration(sourceManifest, targetDb);
    throw new Error(`VALIDATION RESULT: ${JSON.stringify(result, null, 2)}`);
  }

  /**
   * Run basic integrity checks on current database
   * @returns {Object} Integrity check results
   */
  checkIntegrity() {
    const issues = [];

    try {
      // Check for broken foreign keys
      const fkViolations = this.db.prepare('PRAGMA foreign_key_check').all();
      if (fkViolations.length > 0) {
        issues.push({
          type: 'foreign_key_violations',
          count: fkViolations.length,
          details: fkViolations
        });
      }

      // Check for integrity issues
      const integrityCheck = this.db.prepare('PRAGMA integrity_check').all();
      if (integrityCheck.length > 1 || integrityCheck[0].integrity_check !== 'ok') {
        issues.push({
          type: 'integrity_check_failed',
          details: integrityCheck
        });
      }

      return {
        healthy: issues.length === 0,
        issues
      };
    } catch (err) {
      return {
        healthy: false,
        issues: [{
          type: 'check_failed',
          error: err.message
        }]
      };
    }
  }

  /**
   * Validate table structure matches expected schema
   * @param {string} tableName - Table to validate
   * @param {Array<Object>} expectedColumns - Expected column definitions
   * @returns {Object} Validation results
   */
  validateTableStructure(tableName, expectedColumns) {
    try {
      const actualColumns = this.db.prepare(`PRAGMA table_info(${tableName})`).all();

      const issues = [];

      // Check for missing columns
      for (const expected of expectedColumns) {
        const actual = actualColumns.find(col => col.name === expected.name);
        if (!actual) {
          issues.push({
            type: 'missing_column',
            column: expected.name,
            expected: expected
          });
          continue;
        }

        // Check type (basic check)
        if (expected.type && !actual.type.toLowerCase().includes(expected.type.toLowerCase())) {
          issues.push({
            type: 'type_mismatch',
            column: expected.name,
            expected: expected.type,
            actual: actual.type
          });
        }

        // Check NOT NULL constraint
        if (expected.notNull && !actual.notnull) {
          issues.push({
            type: 'missing_not_null',
            column: expected.name
          });
        }

        // Check PRIMARY KEY
        if (expected.primaryKey && !actual.pk) {
          issues.push({
            type: 'missing_primary_key',
            column: expected.name
          });
        }
      }

      // Check for unexpected columns
      for (const actual of actualColumns) {
        const expected = expectedColumns.find(col => col.name === actual.name);
        if (!expected) {
          issues.push({
            type: 'unexpected_column',
            column: actual.name,
            actual: actual
          });
        }
      }

      return {
        valid: issues.length === 0,
        issues,
        columnCount: actualColumns.length,
        expectedCount: expectedColumns.length
      };
    } catch (err) {
      return {
        valid: false,
        issues: [{
          type: 'validation_error',
          error: err.message
        }]
      };
    }
  }
}

module.exports = { DataValidator };