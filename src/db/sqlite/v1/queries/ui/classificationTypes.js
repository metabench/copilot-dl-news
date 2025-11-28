"use strict";

const { getCachedStatements } = require("../helpers");

const CACHE_KEY = Symbol.for("db.sqlite.ui.classificationTypes");

function prepareStatements(db) {
  return getCachedStatements(db, CACHE_KEY, (handle) => ({
    listAll: handle.prepare(`
      SELECT 
        id,
        name,
        display_name,
        emoji,
        description,
        category,
        sort_order
      FROM classification_types
      ORDER BY category, sort_order, display_name
    `),
    
    getById: handle.prepare(`
      SELECT 
        id,
        name,
        display_name,
        emoji,
        description,
        category,
        sort_order,
        created_at
      FROM classification_types
      WHERE id = ?
    `),
    
    getByName: handle.prepare(`
      SELECT 
        id,
        name,
        display_name,
        emoji,
        description,
        category,
        sort_order,
        created_at
      FROM classification_types
      WHERE name = ?
    `),
    
    countByClassification: handle.prepare(`
      SELECT 
        ct.id,
        ct.name,
        ct.display_name,
        ct.emoji,
        ct.category,
        ct.sort_order,
        COUNT(ca.id) as document_count
      FROM classification_types ct
      LEFT JOIN content_analysis ca ON ct.name = ca.classification
      GROUP BY ct.id, ct.name, ct.display_name, ct.emoji, ct.category, ct.sort_order
      ORDER BY document_count DESC, ct.category, ct.sort_order
    `),
    
    getDocumentsForClassification: handle.prepare(`
      SELECT 
        u.id as url_id,
        u.url,
        u.host,
        ca.word_count,
        ca.nav_links_count + ca.article_links_count as link_count,
        ca.analyzed_at,
        hr.http_status as status_code,
        hr.fetched_at
      FROM content_analysis ca
      JOIN content_storage cs ON ca.content_id = cs.id
      JOIN http_responses hr ON cs.http_response_id = hr.id
      JOIN urls u ON hr.url_id = u.id
      WHERE ca.classification = ?
      ORDER BY ca.analyzed_at DESC
      LIMIT ? OFFSET ?
    `),
    
    countDocumentsForClassification: handle.prepare(`
      SELECT COUNT(*) as count
      FROM content_analysis
      WHERE classification = ?
    `),
    
    getRandomDocumentsForClassification: handle.prepare(`
      SELECT 
        u.id as url_id,
        u.url,
        u.host,
        ca.word_count,
        ca.nav_links_count + ca.article_links_count as link_count,
        ca.analyzed_at,
        hr.http_status as status_code,
        hr.fetched_at
      FROM content_analysis ca
      JOIN content_storage cs ON ca.content_id = cs.id
      JOIN http_responses hr ON cs.http_response_id = hr.id
      JOIN urls u ON hr.url_id = u.id
      WHERE ca.classification = ?
      ORDER BY RANDOM()
      LIMIT ?
    `)
  }));
}

/**
 * List all classification types
 * @param {Database} db 
 * @returns {Array<Object>}
 */
function listClassificationTypes(db) {
  const { listAll } = prepareStatements(db);
  return listAll.all();
}

/**
 * Get classification type by ID
 * @param {Database} db 
 * @param {number} id 
 * @returns {Object|undefined}
 */
function getClassificationById(db, id) {
  const { getById } = prepareStatements(db);
  return getById.get(id);
}

/**
 * Get classification type by name
 * @param {Database} db 
 * @param {string} name 
 * @returns {Object|undefined}
 */
function getClassificationByName(db, name) {
  const { getByName } = prepareStatements(db);
  return getByName.get(name);
}

/**
 * List all classifications with document counts
 * @param {Database} db 
 * @returns {Array<Object>}
 */
function listClassificationsWithCounts(db) {
  const { countByClassification } = prepareStatements(db);
  return countByClassification.all();
}

/**
 * Get documents for a specific classification
 * @param {Database} db 
 * @param {string} classification - The classification name
 * @param {Object} options
 * @param {number} options.limit - Max rows to return
 * @param {number} options.offset - Offset for pagination
 * @returns {Array<Object>}
 */
function getDocumentsForClassification(db, classification, { limit = 100, offset = 0 } = {}) {
  const { getDocumentsForClassification } = prepareStatements(db);
  return getDocumentsForClassification.all(classification, limit, offset);
}

/**
 * Count documents for a specific classification
 * @param {Database} db 
 * @param {string} classification - The classification name
 * @returns {number}
 */
function countDocumentsForClassification(db, classification) {
  const { countDocumentsForClassification } = prepareStatements(db);
  const result = countDocumentsForClassification.get(classification);
  return result ? result.count : 0;
}

/**
 * Get a random sample of documents for a specific classification
 * @param {Database} db 
 * @param {string} classification - The classification name
 * @param {Object} options
 * @param {number} options.limit - Max rows to return
 * @returns {Array<Object>}
 */
function getRandomDocumentsForClassification(db, classification, { limit = 10 } = {}) {
  const { getRandomDocumentsForClassification } = prepareStatements(db);
  return getRandomDocumentsForClassification.all(classification, limit);
}

module.exports = {
  listClassificationTypes,
  getClassificationById,
  getClassificationByName,
  listClassificationsWithCounts,
  getDocumentsForClassification,
  countDocumentsForClassification,
  getRandomDocumentsForClassification
};
