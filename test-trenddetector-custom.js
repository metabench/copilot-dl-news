const { TrendDetector } = require('./src/intelligence/analysis/topics/TrendDetector');

console.log('Testing TrendDetector adapter...');

// Mock adapter
const mockAdapter = {
    getTopicDayCount: () => 100,
    getTopicDailyCounts: () => [
        { articleCount: 50 }, { articleCount: 50 }, { articleCount: 50 },
        { articleCount: 50 }, { articleCount: 50 }, { articleCount: 50 }, { articleCount: 50 }
    ],
    getAllTopics: () => [{ id: 1, name: 'Test Topic' }]
};

const detector = new TrendDetector({ topicAdapter: mockAdapter });

const baseline = detector.calculateBaseline(1);
console.log('Baseline:', baseline); // Should be mean 50, stddev low

const result = detector.calculateTrendScore(100, baseline);
console.log('Trend Score:', result); // 100 vs 50 should be high Z

if (result.score > 0 && result.isTrending) {
    console.log('SUCCESS: TrendDetector works.');
} else {
    console.error('FAILURE: Unexpected result.');
    process.exit(1);
}
