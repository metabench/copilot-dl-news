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
    if (data.planets) {
        const insertPlanet = db.prepare("INSERT OR IGNORE INTO places (id, kind, source) VALUES (?, 'planet', ?)");
        const insertPlanetName = db.prepare("INSERT OR IGNORE INTO place_names (place_id, name, lang, name_kind) VALUES (?, ?, ?, ?)");
        for (const planet of data.planets) {
            insertPlanet.run(planet.id, data.source);
            if (planet.names) {
                for (const lang in planet.names) {
                    if (planet.names[lang].common) {
                        for (const name of planet.names[lang].common) {
                            insertPlanetName.run(planet.id, name, lang, 'common');
                        }
                    }
                    if (planet.names[lang].aliases) {
                        for (const name of planet.names[lang].aliases) {
                            insertPlanetName.run(planet.id, name, lang, 'alias');
                        }
                    }
                }
            }
        }
    }
}

module.exports = {
    getCounts,
    seedData
};