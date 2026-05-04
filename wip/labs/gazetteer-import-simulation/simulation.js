const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

class GazetteerImportSimulation extends EventEmitter {
    constructor() {
        super();
        this.logPath = path.join(process.cwd(), 'docs/agi/logs/gazetteer-import-sim.ndjson');
        this.places = [
            { name: 'Toronto', adm1: 'Ontario', country: 'CA', status: 'exists', pop: 2930000 },
            { name: 'Montreal', adm1: 'Quebec', country: 'CA', status: 'exists', pop: 1780000 },
            { name: 'Vancouver', adm1: 'British Columbia', country: 'CA', status: 'exists', pop: 675000 },
            { name: 'Calgary', adm1: 'Alberta', country: 'CA', status: 'exists', pop: 1336000 },
            { name: 'Ottawa', adm1: 'Ontario', country: 'CA', status: 'exists', pop: 1017000 },
            { name: 'Edmonton', adm1: 'Alberta', country: 'CA', status: 'exists', pop: 1010000 },
            { name: 'Quebec City', adm1: 'Quebec', country: 'CA', status: 'exists', pop: 542000 },
            { name: 'Winnipeg', adm1: 'Manitoba', country: 'CA', status: 'exists', pop: 749000 },
            { name: 'Hamilton', adm1: 'Ontario', country: 'CA', status: 'exists', pop: 569000 },
            { name: 'Kitchener', adm1: 'Ontario', country: 'CA', status: 'exists', pop: 256000 },
            { name: 'London', adm1: 'Ontario', country: 'CA', status: 'conflict', pop: 422000, note: 'Conflict with London, UK' },
            { name: 'Victoria', adm1: 'British Columbia', country: 'CA', status: 'exists', pop: 91000 },
            { name: 'Halifax', adm1: 'Nova Scotia', country: 'CA', status: 'exists', pop: 439000 },
            { name: 'Oshawa', adm1: 'Ontario', country: 'CA', status: 'exists', pop: 175000 },
            { name: 'Windsor', adm1: 'Ontario', country: 'CA', status: 'exists', pop: 229000 },
            { name: 'Saskatoon', adm1: 'Saskatchewan', country: 'CA', status: 'exists', pop: 266000 },
            { name: 'St. John\'s', adm1: 'Newfoundland and Labrador', country: 'CA', status: 'new', pop: 110000 },
            { name: 'Regina', adm1: 'Saskatchewan', country: 'CA', status: 'exists', pop: 226000 },
            { name: 'Sherbrooke', adm1: 'Quebec', country: 'CA', status: 'new', pop: 172000 },
            { name: 'Kelowna', adm1: 'British Columbia', country: 'CA', status: 'new', pop: 144000 },
            { name: 'Barrie', adm1: 'Ontario', country: 'CA', status: 'new', pop: 153000 },
            { name: 'Abbotsford', adm1: 'British Columbia', country: 'CA', status: 'new', pop: 153000 },
            { name: 'Kingston', adm1: 'Ontario', country: 'CA', status: 'exists', pop: 132000 },
            { name: 'Sudbury', adm1: 'Ontario', country: 'CA', status: 'exists', pop: 166000 },
            { name: 'Trois-Rivières', adm1: 'Quebec', country: 'CA', status: 'new', pop: 139000 },
            { name: 'Guelph', adm1: 'Ontario', country: 'CA', status: 'new', pop: 143000 },
            { name: 'Moncton', adm1: 'New Brunswick', country: 'CA', status: 'new', pop: 79000 },
            { name: 'Saint John', adm1: 'New Brunswick', country: 'CA', status: 'new', pop: 69000 },
            { name: 'Thunder Bay', adm1: 'Ontario', country: 'CA', status: 'exists', pop: 108000 },
            { name: 'Peterborough', adm1: 'Ontario', country: 'CA', status: 'new', pop: 83000 },
            { name: 'Lethbridge', adm1: 'Alberta', country: 'CA', status: 'new', pop: 98000 },
            { name: 'Nanaimo', adm1: 'British Columbia', country: 'CA', status: 'new', pop: 99000 },
            { name: 'Kamloops', adm1: 'British Columbia', country: 'CA', status: 'new', pop: 97000 },
            { name: 'Belleville', adm1: 'Ontario', country: 'CA', status: 'new', pop: 55000 },
            { name: 'Sarnia', adm1: 'Ontario', country: 'CA', status: 'new', pop: 72000 },
            { name: 'Prince George', adm1: 'British Columbia', country: 'CA', status: 'new', pop: 76000 },
            { name: 'Sault Ste. Marie', adm1: 'Ontario', country: 'CA', status: 'new', pop: 72000 },
            { name: 'Medicine Hat', adm1: 'Alberta', country: 'CA', status: 'new', pop: 63000 },
            { name: 'Red Deer', adm1: 'Alberta', country: 'CA', status: 'new', pop: 100000 },
            { name: 'Drummondville', adm1: 'Quebec', country: 'CA', status: 'new', pop: 79000 },
            { name: 'Saint-Jérôme', adm1: 'Quebec', country: 'CA', status: 'new', pop: 80000 },
            { name: 'Granby', adm1: 'Quebec', country: 'CA', status: 'new', pop: 69000 },
            { name: 'Fredericton', adm1: 'New Brunswick', country: 'CA', status: 'new', pop: 63000 },
            { name: 'Charlottetown', adm1: 'Prince Edward Island', country: 'CA', status: 'new', pop: 38000 },
            { name: 'Whitehorse', adm1: 'Yukon', country: 'CA', status: 'new', pop: 28000 },
            { name: 'Yellowknife', adm1: 'Northwest Territories', country: 'CA', status: 'new', pop: 20000 },
            { name: 'Iqaluit', adm1: 'Nunavut', country: 'CA', status: 'new', pop: 7000 }
        ];
        
        // Ensure log dir exists
        const logDir = path.dirname(this.logPath);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        // Clear old log
        fs.writeFileSync(this.logPath, '');
    }

    log(level, msg, data = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            app: 'IMP',
            level,
            msg,
            data,
            session: 'gazetteer-import-sim'
        };
        fs.appendFileSync(this.logPath, JSON.stringify(entry) + '\n');
        this.emit('log', entry);
    }

    async start() {
        this.log('info', 'Starting gazetteer import simulation for Canada');
        
        let processed = 0;
        const total = this.places.length;

        for (const place of this.places) {
            // Simulate processing time (random between 50ms and 200ms)
            await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 150));

            this.log('debug', `Processing candidate: ${place.name}`, { place });

            // Simulate logic
            if (place.status === 'exists') {
                this.log('info', `Matched existing place: ${place.name}, ${place.adm1}`, { 
                    action: 'match', 
                    confidence: 0.95,
                    place_id: 1000 + processed 
                });
            } else if (place.status === 'conflict') {
                this.log('warn', `Ambiguity detected for ${place.name}`, {
                    action: 'conflict',
                    candidates: [
                        { name: place.name, adm1: place.adm1, country: place.country },
                        { name: place.name, adm1: 'England', country: 'GB' }
                    ]
                });
            } else {
                this.log('info', `Importing new place: ${place.name}`, {
                    action: 'insert',
                    place 
                });
            }

            processed++;
            this.emit('progress', { processed, total, current: place.name });
        }

        this.log('info', 'Import simulation complete', { processed, total });
        this.emit('complete');
    }
}

module.exports = GazetteerImportSimulation;
