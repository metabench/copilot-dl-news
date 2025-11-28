const PlaceView = require('./src/ui/server/gazetteer/views/placeView.js');

try {
    console.log("Attempting to render...");
    const html = PlaceView.renderSearch([], "test query");
    console.log("Render success!");
} catch (e) {
    console.error("Render failed:");
    console.error(e);
}
