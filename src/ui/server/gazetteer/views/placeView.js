const jsgui = require("jsgui3-html");
const { Control, div, h1, h2, h3, p, ul, li, a, table, thead, tbody, tr, th, td, span } = jsgui;

class PlaceView {
  _render(title, buildContentFn) {
    const context = new jsgui.Page_Context();
    const html = new jsgui.html({ context });
    const head = new jsgui.head({ context });
    const body = new jsgui.body({ context });

    const titleCtrl = new jsgui.Control({ context, tagName: 'title' });
    titleCtrl.add(new jsgui.String_Control({ context, text: title }));
    head.add(titleCtrl);

    // Add some basic CSS
    const style = new jsgui.Control({ context, tagName: 'style' });
    style.dom.attributes.type = "text/css";
    style.add(new jsgui.String_Control({
      context,
      text: `
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f0f2f5; color: #333; }
        .container { max-width: 960px; margin: 0 auto; background: white; padding: 24px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
        h1 { border-bottom: 2px solid #e8e8e8; padding-bottom: 12px; margin-top: 0; color: #1a1a2e; }
        h2 { color: #2c3e50; margin-top: 24px; }
        h3 { color: #34495e; font-size: 1em; margin: 16px 0 8px; }
        .section { margin-bottom: 24px; padding: 16px; background: #fafbfc; border-radius: 8px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e8e8e8; }
        th { background-color: #f5f6f8; font-weight: 600; color: #555; }
        tr:hover { background-color: #f8f9fa; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 0.85em; font-weight: 500; margin-right: 6px; }
        .badge-primary { background: #3498db; color: white; }
        .badge-secondary { background: #95a5a6; color: white; }
        .badge-success { background: #27ae60; color: white; }
        .badge-info { background: #9b59b6; color: white; }
        .search-box { margin-bottom: 24px; padding: 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; }
        .search-box form { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .search-box input[type="text"] { padding: 10px 14px; width: 280px; border: none; border-radius: 6px; font-size: 1em; }
        .search-box select { padding: 10px; border: none; border-radius: 6px; font-size: 0.9em; background: white; }
        .search-box button { padding: 10px 20px; background: #2ecc71; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
        .search-box button:hover { background: #27ae60; }
        .search-box a { color: white; font-weight: 600; text-decoration: none; }
        a { color: #3498db; text-decoration: none; }
        a:hover { text-decoration: underline; }
        ul { list-style: none; padding: 0; }
        li { padding: 8px 0; border-bottom: 1px solid #eee; }
        li:last-child { border-bottom: none; }
        .result-item { display: flex; justify-content: space-between; align-items: center; padding: 12px; margin: 8px 0; background: #f8f9fa; border-radius: 6px; transition: background 0.2s; }
        .result-item:hover { background: #e8f4fd; }
        .result-name { font-weight: 500; }
        .result-meta { color: #666; font-size: 0.9em; }
        .breadcrumb { padding: 12px 16px; background: #ecf0f1; border-radius: 6px; margin-bottom: 16px; font-size: 0.9em; }
        .breadcrumb a { margin: 0 4px; }
        .map-link { display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px; background: #e74c3c; color: white; border-radius: 4px; font-size: 0.85em; margin-left: 8px; }
        .map-link:hover { background: #c0392b; text-decoration: none; }
        .welcome { text-align: center; padding: 40px 20px; }
        .welcome h1 { border: none; font-size: 2em; }
        .welcome p { color: #666; font-size: 1.1em; }
        .stats { display: flex; gap: 20px; justify-content: center; margin-top: 20px; }
        .stat-box { padding: 16px 24px; background: #f8f9fa; border-radius: 8px; text-align: center; }
        .stat-box .number { font-size: 1.5em; font-weight: 700; color: #3498db; }
        .stat-box .label { font-size: 0.85em; color: #666; }
        @media (max-width: 600px) {
          .search-box input[type="text"] { width: 100%; }
          .search-box form { flex-direction: column; align-items: stretch; }
        }
      `
    }));
    head.add(style);

    const container = new div({ context, class: "container" });
    
    // Navigation / Search Bar
    const nav = new div({ context, class: "search-box" });
    
    const form = new jsgui.Control({ context, tagName: 'form' });
    form.dom.attributes.action = "/search";
    form.dom.attributes.method = "get";
    
    const homeLink = new a({ context });
    homeLink.dom.attributes.href = "/";
    homeLink.dom.attributes.style = "margin-right: 20px; font-weight: bold; text-decoration: none; color: #333;";
    homeLink.add(new jsgui.String_Control({ context, text: "Gazetteer Info" }));
    form.add(homeLink);

    const input = new jsgui.Control({ context, tagName: 'input' });
    input.dom.attributes.type = "text";
    input.dom.attributes.name = "q";
    input.dom.attributes.placeholder = "Search places...";
    form.add(input);

    // Kind filter dropdown
    const kindSelect = new jsgui.Control({ context, tagName: 'select' });
    kindSelect.dom.attributes.name = "kind";
    const kindOptions = ['', 'city', 'country', 'region', 'state', 'county', 'town', 'village'];
    kindOptions.forEach(k => {
      const opt = new jsgui.Control({ context, tagName: 'option' });
      opt.dom.attributes.value = k;
      opt.add(new jsgui.String_Control({ context, text: k || 'All Types' }));
      kindSelect.add(opt);
    });
    form.add(kindSelect);

    const button = new jsgui.Control({ context, tagName: 'button' });
    button.dom.attributes.type = "submit";
    button.add(new jsgui.String_Control({ context, text: "Search" }));
    form.add(button);

    nav.add(form);
    container.add(nav);

    const contentControl = buildContentFn(context);
    container.add(contentControl);
    
    body.add(container);
    html.add(head);
    html.add(body);

    return html.all_html_render();
  }

  renderSearch(results, query) {
    const pageTitle = query ? `Search: ${query}` : 'Gazetteer Info';
    return this._render(pageTitle, (context) => {
      const content = new div({ context });

      // Show welcome message if no query
      if (!query) {
        const welcome = new div({ context, class: "welcome" });
        const h1Welcome = new h1({ context });
        h1Welcome.add(new jsgui.String_Control({ context, text: "\ud83c\udf0d Gazetteer Info" }));
        welcome.add(h1Welcome);

        const pIntro = new p({ context });
        pIntro.add(new jsgui.String_Control({ context, text: "Search and explore places from around the world. Find cities, countries, regions, and more." }));
        welcome.add(pIntro);

        const suggestions = new p({ context });
        suggestions.dom.attributes.style = "margin-top: 20px;";
        suggestions.add(new jsgui.String_Control({ context, text: "Try searching for: " }));
        
        ['London', 'Tokyo', 'New York', 'Paris'].forEach((city, i) => {
          const sLink = new a({ context });
          sLink.dom.attributes.href = `/search?q=${city}`;
          sLink.add(new jsgui.String_Control({ context, text: city }));
          suggestions.add(sLink);
          if (i < 3) {
            suggestions.add(new jsgui.String_Control({ context, text: ", " }));
          }
        });
        welcome.add(suggestions);
        content.add(welcome);
        return content;
      }

      const h1Ctrl = new h1({ context });
      h1Ctrl.add(new jsgui.String_Control({ context, text: `Search Results for "${query}"` }));
      content.add(h1Ctrl);

      if (results.length === 0) {
        const noResults = new div({ context });
        noResults.dom.attributes.style = "text-align: center; padding: 40px; color: #666;";
        const pCtrl = new p({ context });
        pCtrl.add(new jsgui.String_Control({ context, text: "No results found. Try a different search term." }));
        noResults.add(pCtrl);
        content.add(noResults);
      } else {
        const countP = new p({ context });
        countP.dom.attributes.style = "color: #666; margin-bottom: 16px;";
        countP.add(new jsgui.String_Control({ context, text: `Found ${results.length} result${results.length === 1 ? '' : 's'}` }));
        content.add(countP);

        const list = new div({ context });
        results.forEach(place => {
          const item = new div({ context, class: "result-item" });
          
          const leftDiv = new div({ context });
          const link = new a({ context, class: "result-name" });
          link.dom.attributes.href = `/place/${place.id}`;
          link.add(new jsgui.String_Control({ context, text: place.canonical_name || place.matched_name }));
          leftDiv.add(link);

          // Show matched name if different from canonical
          if (place.matched_name && place.canonical_name && place.matched_name !== place.canonical_name) {
            const matchSpan = new span({ context });
            matchSpan.dom.attributes.style = "color: #888; font-size: 0.85em; margin-left: 8px;";
            matchSpan.add(new jsgui.String_Control({ context, text: `(matched: ${place.matched_name})` }));
            leftDiv.add(matchSpan);
          }

          const metaDiv = new div({ context, class: "result-meta" });
          
          const kindBadge = new span({ context, class: "badge badge-primary" });
          kindBadge.add(new jsgui.String_Control({ context, text: place.kind }));
          metaDiv.add(kindBadge);

          const countryBadge = new span({ context, class: "badge badge-secondary" });
          countryBadge.add(new jsgui.String_Control({ context, text: place.country_code }));
          metaDiv.add(countryBadge);

          leftDiv.add(metaDiv);
          item.add(leftDiv);

          if (place.population) {
            const popDiv = new div({ context });
            popDiv.dom.attributes.style = "text-align: right; color: #555;";
            const popLabel = new div({ context });
            popLabel.dom.attributes.style = "font-size: 0.75em; color: #888;";
            popLabel.add(new jsgui.String_Control({ context, text: "Population" }));
            popDiv.add(popLabel);
            const popValue = new div({ context });
            popValue.dom.attributes.style = "font-weight: 600;";
            popValue.add(new jsgui.String_Control({ context, text: place.population.toLocaleString() }));
            popDiv.add(popValue);
            item.add(popDiv);
          }
          list.add(item);
        });
        content.add(list);
      }
      return content;
    });
  }

  renderPlace(place) {
    const info = place.info;
    return this._render(info.name, (context) => {
      const content = new div({ context });

      // Breadcrumb navigation from parents
      if (place.hierarchy.parents.length > 0) {
        const breadcrumb = new div({ context, class: "breadcrumb" });
        const homeLink = new a({ context });
        homeLink.dom.attributes.href = "/";
        homeLink.add(new jsgui.String_Control({ context, text: "\ud83c\udf10 Home" }));
        breadcrumb.add(homeLink);

        // Reverse parents to show from top-level down
        const sortedParents = [...place.hierarchy.parents].reverse();
        sortedParents.forEach(p => {
          breadcrumb.add(new jsgui.String_Control({ context, text: " \u203a " }));
          const pLink = new a({ context });
          pLink.dom.attributes.href = `/place/${p.parent_id}`;
          pLink.add(new jsgui.String_Control({ context, text: p.name }));
          breadcrumb.add(pLink);
        });
        breadcrumb.add(new jsgui.String_Control({ context, text: ` \u203a ${info.name}` }));
        content.add(breadcrumb);
      }

      // Header
      const h1Ctrl = new h1({ context });
      h1Ctrl.add(new jsgui.String_Control({ context, text: info.name }));
      content.add(h1Ctrl);
      
      const meta = new p({ context });
      
      const badge1 = new span({ context, class: "badge badge-primary" });
      badge1.add(new jsgui.String_Control({ context, text: info.kind }));
      meta.add(badge1);

      const badge2 = new span({ context, class: "badge badge-secondary" });
      badge2.add(new jsgui.String_Control({ context, text: info.countryCode }));
      meta.add(badge2);

      if (info.wikidataQid) {
        const wikiLink = new a({ context });
        wikiLink.dom.attributes.href = `https://www.wikidata.org/wiki/${info.wikidataQid}`;
        wikiLink.dom.attributes.target = "_blank";
        wikiLink.dom.attributes.style = "margin-left: 10px;";
        wikiLink.add(new jsgui.String_Control({ context, text: "Wikidata" }));
        meta.add(wikiLink);
      }
      content.add(meta);

      // Basic Info Table
      const infoSection = new div({ context, class: "section" });
      const h2Details = new h2({ context });
      h2Details.add(new jsgui.String_Control({ context, text: "Details" }));
      infoSection.add(h2Details);

      const infoTable = new table({ context });
      const tbodyInfo = new Control({ context, tagName: 'tbody' });
      
      const addRow = (label, value) => {
          if (!value) return;
          const row = new tr({ context });
          const thCtrl = new Control({ context, tagName: 'th' });
          thCtrl.dom.attributes.width = "150px";
          thCtrl.add(new jsgui.String_Control({ context, text: label }));
          row.add(thCtrl);
          
          const tdCtrl = new td({ context });
          tdCtrl.add(new jsgui.String_Control({ context, text: String(value) }));
          row.add(tdCtrl);
          tbodyInfo.add(row);
      };

      addRow("ID", info.id);
      addRow("Population", info.population ? info.population.toLocaleString() : null);
      addRow("Status", info.status);

      // Coordinates with map link
      if (info.lat && info.lng) {
        const coordRow = new tr({ context });
        const coordTh = new Control({ context, tagName: 'th' });
        coordTh.dom.attributes.width = "150px";
        coordTh.add(new jsgui.String_Control({ context, text: "Coordinates" }));
        coordRow.add(coordTh);
        
        const coordTd = new td({ context });
        coordTd.add(new jsgui.String_Control({ context, text: `${info.lat}, ${info.lng}` }));
        
        const mapLink = new a({ context, class: "map-link" });
        mapLink.dom.attributes.href = `https://www.openstreetmap.org/?mlat=${info.lat}&mlon=${info.lng}&zoom=12`;
        mapLink.dom.attributes.target = "_blank";
        mapLink.add(new jsgui.String_Control({ context, text: "📍 View Map" }));
        coordTd.add(mapLink);
        
        coordRow.add(coordTd);
        tbodyInfo.add(coordRow);
      }
      
      infoTable.add(tbodyInfo);
      infoSection.add(infoTable);
      content.add(infoSection);

      // Names Section
      const namesSection = new div({ context, class: "section" });
      const h2Names = new h2({ context });
      h2Names.add(new jsgui.String_Control({ context, text: "Names" }));
      namesSection.add(h2Names);
      
      Object.entries(place.names).forEach(([kind, names]) => {
          const h3Kind = new h3({ context });
          h3Kind.add(new jsgui.String_Control({ context, text: kind.charAt(0).toUpperCase() + kind.slice(1) }));
          namesSection.add(h3Kind);

          const nameTable = new table({ context });
          const nameHeader = new thead({ context });
          const headerRow = new tr({ context });
          
          ["Name", "Lang", "Source", "Validity"].forEach(text => {
            const thCtrl = new Control({ context, tagName: 'th' });
            thCtrl.add(new jsgui.String_Control({ context, text }));
            headerRow.add(thCtrl);
          });
          
          nameHeader.add(headerRow);
          nameTable.add(nameHeader);

          const nameBody = new Control({ context, tagName: 'tbody' });
          names.forEach(n => {
              const row = new tr({ context });
              
              [n.name, n.lang || '-', n.source || '-'].forEach(text => {
                const tdCtrl = new td({ context });
                tdCtrl.add(new jsgui.String_Control({ context, text: String(text) }));
                row.add(tdCtrl);
              });
              
              // Format validity
              let validity = 'Current';
              if (n.valid_to) validity = `Until ${n.valid_to}`;
              if (n.valid_from) validity = `${n.valid_from} - ${n.valid_to || 'Present'}`;
              
              const tdValid = new td({ context });
              tdValid.add(new jsgui.String_Control({ context, text: validity }));
              row.add(tdValid);

              nameBody.add(row);
          });
          nameTable.add(nameBody);
          namesSection.add(nameTable);
      });
      content.add(namesSection);

      // Hierarchy Section
      if (place.hierarchy.parents.length > 0 || place.hierarchy.children.length > 0) {
          const hierSection = new div({ context, class: "section" });
          const h2Hier = new h2({ context });
          h2Hier.add(new jsgui.String_Control({ context, text: "Hierarchy" }));
          hierSection.add(h2Hier);

          if (place.hierarchy.parents.length > 0) {
              const h3Parents = new h3({ context });
              h3Parents.add(new jsgui.String_Control({ context, text: "Parents" }));
              hierSection.add(h3Parents);

              const parentList = new ul({ context });
              place.hierarchy.parents.forEach(p => {
                  const liCtrl = new li({ context });
                  const link = new a({ context });
                  link.dom.attributes.href = `/place/${p.parent_id}`;
                  link.add(new jsgui.String_Control({ context, text: `${p.name} (${p.kind})` }));
                  liCtrl.add(link);
                  
                  const spanCtrl = new span({ context });
                  spanCtrl.dom.attributes.style = "color: #888;";
                  spanCtrl.add(new jsgui.String_Control({ context, text: ` [${p.relation}]` }));
                  liCtrl.add(spanCtrl);
                  
                  parentList.add(liCtrl);
              });
              hierSection.add(parentList);
          }

          if (place.hierarchy.children.length > 0) {
              const h3Children = new h3({ context });
              h3Children.add(new jsgui.String_Control({ context, text: "Children (Top 20)" }));
              hierSection.add(h3Children);

              const childList = new ul({ context });
              place.hierarchy.children.forEach(c => {
                  const liCtrl = new li({ context });
                  const link = new a({ context });
                  link.dom.attributes.href = `/place/${c.child_id}`;
                  link.add(new jsgui.String_Control({ context, text: `${c.name} (${c.kind})` }));
                  liCtrl.add(link);
                  childList.add(liCtrl);
              });
              hierSection.add(childList);
          }
          content.add(hierSection);
      }

      // Attributes Section
      if (place.attributes && Object.keys(place.attributes).length > 0) {
          const attrSection = new div({ context, class: "section" });
          const h2Attr = new h2({ context });
          h2Attr.add(new jsgui.String_Control({ context, text: "Attributes" }));
          attrSection.add(h2Attr);

          Object.entries(place.attributes).forEach(([source, attrs]) => {
              const h3Source = new h3({ context });
              h3Source.add(new jsgui.String_Control({ context, text: `Source: ${source}` }));
              attrSection.add(h3Source);

              const attrTable = new table({ context });
              const attrHeader = new thead({ context });
              const headerRow = new tr({ context });
              
              ["Type", "Value"].forEach(text => {
                const thCtrl = new Control({ context, tagName: 'th' });
                thCtrl.add(new jsgui.String_Control({ context, text }));
                headerRow.add(thCtrl);
              });
              
              attrHeader.add(headerRow);
              attrTable.add(attrHeader);

              const attrBody = new Control({ context, tagName: 'tbody' });
              attrs.forEach(attr => {
                  const row = new tr({ context });
                  
                  const tdKind = new td({ context });
                  tdKind.add(new jsgui.String_Control({ context, text: attr.attribute_kind || '-' }));
                  row.add(tdKind);

                  const tdValue = new td({ context });
                  tdValue.add(new jsgui.String_Control({ context, text: attr.value || '-' }));
                  row.add(tdValue);

                  attrBody.add(row);
              });
              attrTable.add(attrBody);
              attrSection.add(attrTable);
          });
          content.add(attrSection);
      }

      return content;
    });
  }
}

module.exports = new PlaceView();
