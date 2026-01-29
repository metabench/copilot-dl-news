# Architecture Books: Proposed Modules

**Objective**: Transition away from the monolithic nature of the current repository by extracting specific features into standalone, working repositories.

## The Books

### [Book 1: News Platform Core (`copilot-news-platform`)](./Book1-Platform-Core.md)
The central "brain" containing the unified **News + Gazetteer Database**, API Gateway, and Advanced UI. **This is the foundation upon which all other modules depend.**

### [Book 2: Intelligent Crawler (`copilot-news-crawler`)](./Book2-Intelligent-Crawler.md)
The stateless worker that fetches content **and** performs in-stream analysis (Hub Detection, Pattern Extraction).

## Workflow
1.  **Draft Design**: (In Progress) See books above.
2.  **Prototype**: Initialize `copilot-news-platform` first.
3.  **Migrate**: Copy `news.db`, build API, port UI.
4.  **Integrate**: Point Crawler module at Platform API.


