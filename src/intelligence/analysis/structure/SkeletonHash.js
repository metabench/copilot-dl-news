const cheerio = require('cheerio');
const crypto = require('crypto');

/**
 * SkeletonHash: A static analysis tool for generating structural signatures of HTML.
 * 
 * Levels:
 * - Level 1 (Template): Includes tags, IDs, and classes. High specificity.
 * - Level 2 (Structure): Includes tags only. Low specificity, good for clustering layout families.
 */
class SkeletonHash {
    constructor() {
        // Tags to completely ignore (prune from tree)
        this.ignoredTags = new Set([
            'script', 'style', 'meta', 'link', 'noscript', 'iframe', 'svg', 'path', 'br', 'hr'
        ]);
        
        // Attributes to include in Level 1
        this.significantAttributes = ['id', 'class'];
    }

    /**
     * Compute the SkeletonHash for a given HTML string.
     * @param {string} html - Raw HTML content
     * @param {number} level - 1 (Template) or 2 (Structure)
     * @returns {object} { hash: string, signature: string }
     */
    compute(html, level = 2) {
        if (!html) return { hash: '0', signature: '' };

        const $ = cheerio.load(html);
        const root = $.root();

        // Prune first
        this._prune($, root);

        // Serialize
        const signature = this._serialize($, root, level);
        
        // Hash
        const hash = crypto.createHash('sha256')
            .update(signature)
            .digest('hex')
            .substring(0, 16); // 64-bit equivalent

        return { hash, signature };
    }

    /**
     * Remove noise tags from the DOM in-place.
     */
    _prune($, node) {
        const that = this;
        node.find('*').each(function() {
            const tagName = this.tagName.toLowerCase();
            if (that.ignoredTags.has(tagName)) {
                $(this).remove();
            }
        });
    }

    /**
     * Recursively serialize the DOM structure.
     */
    _serialize($, node, level) {
        let output = '';

        // If it's the root, just process children
        if (node.is(':root') || (node[0] && node[0].type === 'root')) {
            node.children().each((i, el) => {
                output += this._serialize($, $(el), level);
            });
            return output;
        }

        // Skip non-element nodes (text, comments, etc.)
        if (!node[0]) return '';
        
        if (node[0].type !== 'tag') {
            return '';
        }

        const tagName = node[0].tagName.toLowerCase();
        output += tagName;

        // Level 1: Add attributes
        if (level === 1) {
            const attrs = [];
            
            // ID
            const id = node.attr('id');
            if (id) attrs.push(`#${id.trim()}`);

            // Classes
            const cls = node.attr('class');
            if (cls) {
                const sortedClasses = cls.split(/\s+/).filter(c => c).sort().join('.');
                if (sortedClasses) attrs.push(`.${sortedClasses}`);
            }

            output += attrs.join('');
        }

        // Process children
        const children = node.children();
        if (children.length > 0) {
            output += '(';
            children.each((i, el) => {
                output += this._serialize($, $(el), level);
            });
            output += ')';
        }

        return output;
    }
}

module.exports = new SkeletonHash();
