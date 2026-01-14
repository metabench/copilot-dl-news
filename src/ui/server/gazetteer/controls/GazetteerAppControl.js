"use strict";

/**
 * GazetteerAppControl - Main application control for Gazetteer Info
 * 
 * Composes the Gazetteer Info page using jsgui3 controls:
 * - Search bar header
 * - Main content (search results or place details)
 * 
 * This follows the same pattern as DocAppControl in the docs viewer.
 */

const jsgui = require("jsgui3-html");
const { BaseAppControl } = require('../../../../shared/BaseAppControl");
const { GazetteerSearchFormControl, KIND_OPTIONS } = require("./GazetteerSearchFormControl");
const { GazetteerBreadcrumbControl } = require("./GazetteerBreadcrumbControl");
const { GazetteerResultItemControl } = require("./GazetteerResultItemControl");
const { PlaceBadgeControl } = require("./PlaceBadgeControl");

const StringControl = jsgui.String_Control;

/**
 * View types supported by the Gazetteer
 */
const VIEW_TYPES = Object.freeze({
  SEARCH: "search",
  PLACE: "place"
});

/**
 * Main application control for the Gazetteer Info
 */
class GazetteerAppControl extends BaseAppControl {
  /**
   * @param {Object} spec - Control specification
   * @param {string} spec.viewType - Type of view to render (search or place)
   * @param {string} spec.query - Search query (for search view)
   * @param {Array} spec.results - Search results (for search view)
   * @param {Object} spec.place - Place data (for place view)
   */
  constructor(spec = {}) {
    super({
      ...spec,
      appName: "Gazetteer Info",
      appClass: "gazetteer",
      title: spec.title || "Gazetteer Info"
    });
    
    // View-specific state
    this.viewType = spec.viewType || VIEW_TYPES.SEARCH;
    this.query = spec.query || "";
    this.results = spec.results || [];
    this.place = spec.place || null;
    this.selectedKind = spec.selectedKind || "";
    
    // Now compose after all properties are set
    if (!spec.el) {
      this.compose();
    }
  }

  /**
   * Override header to build search bar using GazetteerSearchFormControl
   */
  _buildHeader() {
    const header = new jsgui.Control({ context: this.context, tagName: "header" });
    header.add_class("gazetteer__header");
    
    const nav = new jsgui.Control({ context: this.context, tagName: "nav" });
    nav.add_class("gazetteer__search-box");
    
    const form = new GazetteerSearchFormControl({
      context: this.context,
      query: this.query,
      selectedKind: this.selectedKind
    });
    
    nav.add(form);
    header.add(nav);
    
    return header;
  }

  /**
   * Compose main content based on view type
   */
  composeMainContent() {
    switch (this.viewType) {
      case VIEW_TYPES.SEARCH:
        this._composeSearchView();
        break;
      case VIEW_TYPES.PLACE:
        this._composePlaceView();
        break;
      default:
        this._composeSearchView();
    }
  }

  /**
   * Compose the search/home view
   */
  _composeSearchView() {
    const content = new jsgui.Control({ context: this.context, tagName: "div" });
    content.add_class("gazetteer__content");
    
    if (!this.query) {
      // Welcome view
      this._buildWelcome(content);
    } else if (this.results.length === 0) {
      // No results
      this._buildNoResults(content);
    } else {
      // Results list
      this._buildResultsList(content);
    }
    
    this.mainContainer.add(content);
  }

  /**
   * Build welcome screen for home page
   */
  _buildWelcome(container) {
    const welcome = new jsgui.Control({ context: this.context, tagName: "div" });
    welcome.add_class("gazetteer__welcome");
    
    const h1 = new jsgui.Control({ context: this.context, tagName: "h1" });
    h1.add(new StringControl({ context: this.context, text: "🌍 Gazetteer Info" }));
    welcome.add(h1);
    
    const intro = new jsgui.Control({ context: this.context, tagName: "p" });
    intro.add(new StringControl({ 
      context: this.context, 
      text: "Search and explore places from around the world. Find cities, countries, regions, and more." 
    }));
    welcome.add(intro);
    
    // Suggested searches
    const suggestions = new jsgui.Control({ context: this.context, tagName: "p" });
    suggestions.add_class("gazetteer__suggestions");
    suggestions.add(new StringControl({ context: this.context, text: "Try searching for: " }));
    
    const cities = ["London", "Tokyo", "New York", "Paris"];
    cities.forEach((city, i) => {
      const link = new jsgui.Control({ context: this.context, tagName: "a" });
      link.dom.attributes.href = `/search?q=${encodeURIComponent(city)}`;
      link.add(new StringControl({ context: this.context, text: city }));
      suggestions.add(link);
      
      if (i < cities.length - 1) {
        suggestions.add(new StringControl({ context: this.context, text: ", " }));
      }
    });
    welcome.add(suggestions);
    
    container.add(welcome);
  }

  /**
   * Build no results message
   */
  _buildNoResults(container) {
    const h1 = new jsgui.Control({ context: this.context, tagName: "h1" });
    h1.add(new StringControl({ context: this.context, text: `Search Results for "${this.query}"` }));
    container.add(h1);
    
    const noResults = new jsgui.Control({ context: this.context, tagName: "div" });
    noResults.add_class("gazetteer__no-results");
    
    const p = new jsgui.Control({ context: this.context, tagName: "p" });
    p.add(new StringControl({ context: this.context, text: "No results found. Try a different search term." }));
    noResults.add(p);
    
    container.add(noResults);
  }

  /**
   * Build search results list using GazetteerResultItemControl
   */
  _buildResultsList(container) {
    const h1 = new jsgui.Control({ context: this.context, tagName: "h1" });
    h1.add(new StringControl({ context: this.context, text: `Search Results for "${this.query}"` }));
    container.add(h1);
    
    const count = new jsgui.Control({ context: this.context, tagName: "p" });
    count.add_class("gazetteer__result-count");
    count.add(new StringControl({ 
      context: this.context, 
      text: `Found ${this.results.length} result${this.results.length === 1 ? "" : "s"}` 
    }));
    container.add(count);
    
    const list = new jsgui.Control({ context: this.context, tagName: "div" });
    list.add_class("gazetteer__results-list");
    
    for (const place of this.results) {
      const item = new GazetteerResultItemControl({
        context: this.context,
        place
      });
      list.add(item);
    }
    
    container.add(list);
  }

  /**
   * Compose the place detail view
   */
  _composePlaceView() {
    if (!this.place) {
      const msg = new jsgui.Control({ context: this.context, tagName: "p" });
      msg.add(new StringControl({ context: this.context, text: "Place not found" }));
      this.mainContainer.add(msg);
      return;
    }
    
    const content = new jsgui.Control({ context: this.context, tagName: "div" });
    content.add_class("gazetteer__content");
    
    const info = this.place.info;
    const hierarchy = this.place.hierarchy || {};
    
    // Breadcrumb using GazetteerBreadcrumbControl
    if (hierarchy.parents && hierarchy.parents.length > 0) {
      const breadcrumb = new GazetteerBreadcrumbControl({
        context: this.context,
        currentName: info.name,
        parents: hierarchy.parents
      });
      content.add(breadcrumb);
    }
    
    // Title
    const h1 = new jsgui.Control({ context: this.context, tagName: "h1" });
    h1.add(new StringControl({ context: this.context, text: info.name }));
    content.add(h1);
    
    // Meta badges using PlaceBadgeControl
    const meta = new jsgui.Control({ context: this.context, tagName: "p" });
    meta.add_class("gazetteer__place-meta");
    
    const kindBadge = new PlaceBadgeControl({
      context: this.context,
      text: info.kind,
      variant: "kind"
    });
    meta.add(kindBadge);
    
    const countryBadge = new PlaceBadgeControl({
      context: this.context,
      text: info.countryCode,
      variant: "country"
    });
    meta.add(countryBadge);
    
    if (info.wikidataQid) {
      const wikiLink = new jsgui.Control({ context: this.context, tagName: "a" });
      wikiLink.dom.attributes.href = `https://www.wikidata.org/wiki/${info.wikidataQid}`;
      wikiLink.dom.attributes.target = "_blank";
      wikiLink.add_class("gazetteer__wiki-link");
      wikiLink.add(new StringControl({ context: this.context, text: "Wikidata" }));
      meta.add(wikiLink);
    }
    content.add(meta);
    
    // Details section
    const details = this._buildDetailsSection(info);
    content.add(details);
    
    // Children section
    if (hierarchy.children && hierarchy.children.length > 0) {
      const children = this._buildChildrenSection(hierarchy.children);
      content.add(children);
    }
    
    // Alternate names
    if (this.place.alternateNames && this.place.alternateNames.length > 0) {
      const altNames = this._buildAltNamesSection(this.place.alternateNames);
      content.add(altNames);
    }
    
    this.mainContainer.add(content);
  }

  /**
   * Build details section
   */
  _buildDetailsSection(info) {
    const section = new jsgui.Control({ context: this.context, tagName: "section" });
    section.add_class("gazetteer__section");
    
    const h2 = new jsgui.Control({ context: this.context, tagName: "h2" });
    h2.add(new StringControl({ context: this.context, text: "Details" }));
    section.add(h2);
    
    const table = new jsgui.Control({ context: this.context, tagName: "table" });
    table.add_class("gazetteer__details-table");
    
    const tbody = new jsgui.Control({ context: this.context, tagName: "tbody" });
    
    const fields = [
      { label: "ID", value: info.id },
      { label: "Name", value: info.name },
      { label: "Kind", value: info.kind },
      { label: "Country", value: info.countryCode },
      { label: "Population", value: info.population ? info.population.toLocaleString() : null },
      { label: "Latitude", value: info.latitude },
      { label: "Longitude", value: info.longitude },
      { label: "Timezone", value: info.timezone }
    ];
    
    for (const field of fields) {
      if (field.value != null) {
        const tr = new jsgui.Control({ context: this.context, tagName: "tr" });
        
        const th = new jsgui.Control({ context: this.context, tagName: "th" });
        th.add(new StringControl({ context: this.context, text: field.label }));
        tr.add(th);
        
        const td = new jsgui.Control({ context: this.context, tagName: "td" });
        td.add(new StringControl({ context: this.context, text: String(field.value) }));
        tr.add(td);
        
        tbody.add(tr);
      }
    }
    
    table.add(tbody);
    section.add(table);
    
    return section;
  }

  /**
   * Build children section
   */
  _buildChildrenSection(children) {
    const section = new jsgui.Control({ context: this.context, tagName: "section" });
    section.add_class("gazetteer__section");
    
    const h2 = new jsgui.Control({ context: this.context, tagName: "h2" });
    h2.add(new StringControl({ context: this.context, text: `Contains (${children.length})` }));
    section.add(h2);
    
    const list = new jsgui.Control({ context: this.context, tagName: "ul" });
    list.add_class("gazetteer__children-list");
    
    for (const child of children) {
      const li = new jsgui.Control({ context: this.context, tagName: "li" });
      
      const link = new jsgui.Control({ context: this.context, tagName: "a" });
      link.dom.attributes.href = `/place/${child.child_id}`;
      link.add(new StringControl({ context: this.context, text: child.name }));
      li.add(link);
      
      if (child.kind) {
        const kind = new jsgui.Control({ context: this.context, tagName: "span" });
        kind.add_class("gazetteer__child-kind");
        kind.add(new StringControl({ context: this.context, text: ` (${child.kind})` }));
        li.add(kind);
      }
      
      list.add(li);
    }
    
    section.add(list);
    return section;
  }

  /**
   * Build alternate names section
   */
  _buildAltNamesSection(names) {
    const section = new jsgui.Control({ context: this.context, tagName: "section" });
    section.add_class("gazetteer__section");
    
    const h2 = new jsgui.Control({ context: this.context, tagName: "h2" });
    h2.add(new StringControl({ context: this.context, text: "Alternate Names" }));
    section.add(h2);
    
    const list = new jsgui.Control({ context: this.context, tagName: "ul" });
    list.add_class("gazetteer__alt-names-list");
    
    for (const name of names.slice(0, 20)) {
      const li = new jsgui.Control({ context: this.context, tagName: "li" });
      li.add(new StringControl({ context: this.context, text: name.name }));
      
      if (name.language) {
        const lang = new jsgui.Control({ context: this.context, tagName: "span" });
        lang.add_class("gazetteer__alt-name-lang");
        lang.add(new StringControl({ context: this.context, text: ` [${name.language}]` }));
        li.add(lang);
      }
      
      list.add(li);
    }
    
    if (names.length > 20) {
      const more = new jsgui.Control({ context: this.context, tagName: "li" });
      more.add_class("gazetteer__alt-names-more");
      more.add(new StringControl({ context: this.context, text: `... and ${names.length - 20} more` }));
      list.add(more);
    }
    
    section.add(list);
    return section;
  }

  /**
   * Override footer (minimal for gazetteer)
   */
  _buildFooter() {
    const footer = new jsgui.Control({ context: this.context, tagName: "footer" });
    footer.add_class("gazetteer__footer");
    return footer;
  }
}

GazetteerAppControl.VIEW_TYPES = VIEW_TYPES;

module.exports = { GazetteerAppControl, VIEW_TYPES };
