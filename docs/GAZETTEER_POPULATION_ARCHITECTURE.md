# Gazetteer Population Architecture

This document outlines the data flow and architecture for the `populate-gazetteer.js` tool, which seeds the local SQLite gazetteer.

## Data Flow Diagram

```mermaid
graph TD
    subgraph Sources
        RC[REST Countries API v3.1]
        WD[Wikidata SPARQL Endpoint]
    end

    subgraph "populate-gazetteer.js"
        Fetcher[Data Fetcher]
        Cache[HttpRequestResponseFacade]
        Parser[Data Parser & Normalizer]
        Dedup[Deduplication Logic]
    end

    subgraph "SQLite Gazetteer (news.db)"
        T_Places[places]
        T_Names[place_names]
        T_Ext[place_external_ids]
        T_Hier[place_hierarchy]
        T_Attr[place_attribute_values]
        T_Runs[ingestion_runs]
        T_Http[http_responses]
    end

    RC -->|Countries, Capitals, Flags, Demonyms| Fetcher
    WD -->|ADM1, ADM2, Cities| Fetcher
    Fetcher <-->|Read/Write| Cache
    Cache <-->|Store Responses| T_Http
    Fetcher --> Parser
    Parser --> Dedup
    Dedup -->|Check Existing| T_Ext
    Dedup -->|Check Existing| T_Places
    Dedup -->|Insert/Update| T_Places
    Dedup -->|Insert Names| T_Names
    Dedup -->|Link IDs| T_Ext
    Dedup -->|Build Tree| T_Hier
    Dedup -->|Store Stats| T_Attr
    Dedup -->|Track Run| T_Runs

    style RC fill:#f96,stroke:#333,stroke-width:2px
    style WD fill:#9f6,stroke:#333,stroke-width:2px
    style T_Places fill:#ccf,stroke:#333,stroke-width:1px
```

## Information Sources

### 1. REST Countries API (v3.1)
Primary source for top-level country data.
- **Entities:** Countries, Capital Cities.
- **Attributes:** Population, Area, Lat/Lng, Timezones, Region/Subregion.
- **Names:** Common, Official, Native (multi-lingual), Translations, Alt Spellings.
- **Metadata:** Flags, Maps, TLDs, Currencies, IDD codes.

### 2. Wikidata (SPARQL)
Secondary source for hierarchical depth.
- **Entities:**
    - **ADM1:** First-level administrative divisions (States, Provinces, Regions).
    - **ADM2:** Second-level administrative divisions (Counties, Districts).
    - **Cities:** Major cities (populated places).
- **Attributes:** Population, Coordinates, ISO 3166-2 codes.
- **Relationships:** Parent/Child hierarchy (City -> ADM2 -> ADM1 -> Country).

## Storage Strategy

The tool uses a "Deduplication First" approach:
1.  **External IDs:** Checks `place_external_ids` (e.g., `wikidata:Q123`, `restcountries:capital:GB:london`) to find existing records.
2.  **Updates:** If found, updates attributes and adds new names/aliases.
3.  **Inserts:** If not found, creates new `places` records.
4.  **Hierarchy:** Links places via `place_hierarchy` (e.g., `capital_of`, `admin_parent`).
