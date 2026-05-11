const {
    getBootstrapGazetteerCounts,
    seedBootstrapData
} = require('news-crawler-db');

function getCounts(db) {
    return getBootstrapGazetteerCounts(db);
}

function seedData(db, data) {
    seedBootstrapData(db, data);
}

module.exports = {
    getCounts,
    seedData
};
