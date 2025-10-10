const NewsDatabase = require('./SQLiteNewsDatabase');

function getCounts(db) {
    try {
        const places = db.prepare('SELECT COUNT(*) as count FROM places').get().count;
        const countries = db.prepare("SELECT COUNT(*) as count FROM places WHERE kind='country'").get().count;
        return { gazetteer: places, gazetteer_countries: countries };
    } catch (err) {
        return { gazetteer: 0, gazetteer_countries: 0 };
    }
}

function seedData(db, data) {
    // This is a placeholder. In a real scenario, you would insert data.
}

module.exports = {
    getCounts,
    seedData
};