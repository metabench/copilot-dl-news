const cheerio = require('cheerio');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const url = 'https://www.theguardian.com/world/france';

async function inspect() {
    console.log(`Fetching ${url}...`);
    const res = await fetch(url);
    const html = await res.text();
    const $ = cheerio.load(html);

    console.log('Title:', $('title').text());
    
    // Look for pagination
    const pages = new Set();
    $('a[href*="page="]').each((i, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        console.log(`Pagination link: [${text}] -> ${href}`);
        const match = href.match(/page=(\d+)/);
        if (match) pages.add(parseInt(match[1], 10));
    });
    
    if (pages.size > 0) {
        const maxPage = Math.max(...pages);
        console.log('Max page detected:', maxPage);
    }


    // Probe deep
    const deepUrl = `${url}?page=500`;
    console.log(`Probing deep URL: ${deepUrl}...`);
    const resDeep = await fetch(deepUrl);
    console.log(`Deep URL Status: ${resDeep.status}, Final URL: ${resDeep.url}`);
    if (resDeep.ok) {
        const htmlDeep = await resDeep.text();
        const $deep = cheerio.load(htmlDeep);
        
        // Check for "No results" or content
        const articles = $deep('h3').length; // simple heuristic
        console.log(`Articles found on deep page: ${articles}`);
        
        const timesDeep = [];
        $deep('time').each((i, el) => {
            timesDeep.push($(el).attr('datetime') || $(el).text());
        });
        if (timesDeep.length > 0) {
            console.log('Oldest/Newest on deep page:', timesDeep.slice(0,3));
        }

        // Debug links
        const links = [];
        $deep('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.match(/\/\d{4}\/\w{3}\/\d{2}\//)) {
                links.push(href);
            }
        });
        console.log('Sample Article Links:', links.slice(0,3));
    }
}

inspect();
