const express = require('express');
const path = require('path');

/**
 * @server Gazetteer Info
 * @description Provides a web interface for searching and viewing place details from the gazetteer database.
 */

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const { ensureDb } = require('../../db/sqlite/ensureDb');
const PlaceService = require('./gazetteer/services/placeService');
const placeView = require('./gazetteer/views/placeView');

const app = express();
const PORT = process.env.PORT || 3000;

// Database Setup
const dbPath = path.join(process.cwd(), 'data', 'gazetteer.db');
let db;
try {
  db = ensureDb(dbPath, { fileMustExist: true });
  console.log(`Connected to gazetteer database at ${dbPath}`);
} catch (err) {
  console.error(`Failed to connect to database at ${dbPath}:`, err.message);
  process.exit(1);
}

// Service Setup
const placeService = new PlaceService(db);

// Middleware
app.use(express.urlencoded({ extended: true }));

app.get('/favicon.ico', (req, res) => res.status(204).end());

// Routes

// Home / Search Page
app.get('/', (req, res) => {
  // Just render an empty search result as the home page
  const html = placeView.renderSearch([], '');
  res.send(html);
});

// Search Results
app.get('/search', (req, res) => {
  const query = req.query.q;
  const kind = req.query.kind;
  if (!query) {
    return res.redirect('/');
  }
  
  try {
    const options = {};
    if (kind) options.kind = kind;
    
    const results = placeService.search(query, options);
    const html = placeView.renderSearch(results, query);
    res.send(html);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Place Details
app.get('/place/:id', (req, res) => {
  const id = req.params.id;
  try {
    const place = placeService.getPlace(id);
    if (!place) {
      return res.status(404).send('Place not found');
    }
    const html = placeView.renderPlace(place);
    res.send(html);
  } catch (err) {
    console.error('Place details error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Start Server
const server = app.listen(PORT, () => {
  console.log(`Gazetteer Info Server running at http://localhost:${PORT}`);
});

server.on('error', (e) => {
  console.error('Server error:', e);
});
