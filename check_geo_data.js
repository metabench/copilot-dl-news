const db = require('better-sqlite3')('data/news.db'); 

// 1. Get IDs for Canada and UK
const ca = db.prepare("SELECT id, country_code, CAST(id AS TEXT) as id_str FROM places WHERE country_code = 'CA'").get();
const uk = db.prepare("SELECT id, country_code, CAST(id AS TEXT) as id_str FROM places WHERE country_code = 'GB'").get();

console.log('CA:', ca);
console.log('UK:', uk);

// 2. Check for regions/children
if (ca) {
    const caRegions = db.prepare("SELECT COUNT(*) as cnt FROM places WHERE kind='region' AND country_code='CA'").get();
    console.log('CA Regions:', caRegions.cnt);
}

if (uk) {
    const ukRegions = db.prepare("SELECT COUNT(*) as cnt FROM places WHERE kind='region' AND country_code='GB'").get();
    console.log('UK Regions:', ukRegions.cnt);
}

// 3. Check for cities
if (ca) {
    const caCities = db.prepare("SELECT COUNT(*) as cnt FROM places WHERE kind='city' AND country_code='CA'").get();
    console.log('CA Cities:', caCities.cnt);
}
if (uk) {
    const ukCities = db.prepare("SELECT COUNT(*) as cnt FROM places WHERE kind='city' AND country_code='GB'").get();
    console.log('UK Cities:', ukCities.cnt);
}
