"use strict";

const jsgui = require("jsgui3-client");
const { Control, Active_HTML_Document, controls } = jsgui;

function normalizeUrlSegment(segment) {
	if (!segment || typeof segment !== "string") return "";
	return segment.replace(/-/g, " ").toLowerCase().trim();
}

class PlaceNamesMatchingViewPage extends Control {
	constructor(spec = {}) {
		super({
			...spec,
			tagName: "section",
			__type_name: spec.__type_name || "place_names_match_view_page"
		});

		this.add_class("place-names-match-view");

		if (!spec.el) {
			this.compose();
		}
	}

	compose() {
		const context = this.context;

		const tag = (tagName, spec = {}) => {
			const { text, ...rest } = spec;
			const Ctor = jsgui[tagName] || Control;
			const ctrl = new Ctor({ context, tagName, __type_name: tagName, ...rest });
			if (typeof text === "string" && text.length) ctrl.add_text(text);
			return ctrl;
		};

		const place = {
			info: {
				id: 21,
				name: "London",
				kind: "city",
				countryCode: "GB",
				wikidataQid: "Q84"
			},
			matchKeys: {
				normalized: "london",
				slug: "london",
				ambiguityCount: 3
			},
			namesByLang: {
				en: [
					{ name: "London", preferred: true, official: true, source: "geonames", normalized: "london" }
				],
				fr: [
					{ name: "Londres", preferred: false, official: false, source: "wikidata", normalized: "londres" }
				]
			}
		};

		const root = tag("div");
		root.add_class("pnmv__card");
		root.add(tag("h1", { text: `${place.info.name} — Names + Matching` }));
		root.add(tag("p", { text: `id ${place.info.id} · ${place.info.kind} · ${place.info.countryCode} · ${place.info.wikidataQid}` }));

		const keys = tag("div");
		keys.add_class("pnmv__section");
		keys.add(tag("h2", { text: "Match keys" }));
		keys.add(tag("p", { text: `normalized: ${place.matchKeys.normalized}` }));
		keys.add(tag("p", { text: `slug (optional): ${place.matchKeys.slug}` }));
		keys.add(tag("p", { text: `ambiguity: ${place.matchKeys.ambiguityCount} places share this key` }));
		root.add(keys);

		const names = tag("div");
		names.add_class("pnmv__section");
		names.add(tag("h2", { text: "Names by language" }));

		for (const [lang, entries] of Object.entries(place.namesByLang)) {
			const langRow = tag("div");
			langRow.add_class("pnmv__langRow");
			langRow.add(tag("span", { text: lang.toUpperCase() }));
			langRow.add(tag("span", { text: `(${entries.length})` }));
			names.add(langRow);

			for (const entry of entries) {
				const row = tag("div");
				row.add_class("pnmv__nameRow");
				row.add(tag("span", { text: entry.name }));
				row.add(tag("span", { text: `· src:${entry.source}` }));
				if (entry.preferred) row.add(tag("span", { text: "· preferred" }));
				if (entry.official) row.add(tag("span", { text: "· official" }));
				row.add(tag("span", { text: `· normalized:${entry.normalized}` }));
				names.add(row);
			}
		}
		root.add(names);

		const inspector = tag("div");
		inspector.add_class("pnmv__section");
		inspector.add(tag("h2", { text: "Match inspector (fixture)" }));
		const sample = "london-news";
		inspector.add(tag("p", { text: `segment: ${sample}` }));
		inspector.add(tag("p", { text: `normalized: ${normalizeUrlSegment(sample)}` }));
		root.add(inspector);

		this.add(root);
	}
}

PlaceNamesMatchingViewPage.css = `
.place-names-match-view {
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  color: #e7eefc;
}

.pnmv__card {
  padding: 16px;
  border-radius: 12px;
  border: 1px solid #24345f;
  background: #0f172a;
}

.pnmv__section {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid #223055;
}

.pnmv__langRow {
  margin-top: 10px;
  display: flex;
  gap: 10px;
  font-weight: 600;
}

.pnmv__nameRow {
  margin-top: 6px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  color: #cbd5ff;
}
`;

controls.place_names_match_view_page = PlaceNamesMatchingViewPage;

class ActivationLabPage extends Active_HTML_Document {
	constructor(spec = {}) {
		super({ ...spec, __type_name: spec.__type_name || "activation_lab_page" });
		if (!spec.el) {
			this.compose();
		}
	}

	compose() {
		const context = this.context;

		const tag = (tagName, spec = {}) => {
			const { text, ...rest } = spec;
			const Ctor = jsgui[tagName] || Control;
			const ctrl = new Ctor({ context, tagName, __type_name: tagName, ...rest });
			if (typeof text === "string" && text.length) ctrl.add_text(text);
			return ctrl;
		};

		const title = tag("h1", { text: "Gazetteer — Place Names + Matching Inspector (fixture)" });
		title.add_class("pnmv__title");

		const style = tag("style");
		style.add_text(`
body { background: #0b1220; margin: 0; padding: 18px; }
.pnmv__title { font-size: 18px; margin: 0 0 12px 0; color: #ffffff; }
${PlaceNamesMatchingViewPage.css}
`);
		this.head.add(style);

		const favicon = tag("link");
		favicon.dom.attributes.rel = "icon";
		favicon.dom.attributes.href = "data:,";
		this.head.add(favicon);

		const host = tag("main");
		host.add(title);
		host.add(new PlaceNamesMatchingViewPage({ context }));
		this.body.add(host);
	}
}

controls.activation_lab_page = ActivationLabPage;

module.exports = jsgui;
