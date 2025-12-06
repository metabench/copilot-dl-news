const cheerio = require('cheerio');

class SkeletonDiff {
    /**
     * Generate a mask of dynamic nodes across a set of pages that share the same structure.
     * @param {Array} cheerioInstances - Array of cheerio instances (e.g., results of cheerio.load(html)).
     * @returns {{ dynamicPaths: string[] }}
     */
    generateMask(cheerioInstances) {
        if (!Array.isArray(cheerioInstances) || cheerioInstances.length < 2) {
            throw new Error('generateMask requires at least two cheerio roots');
        }

        // Normalize to { $, root }
        const roots = cheerioInstances.map((instance, idx) => {
            if (typeof instance !== 'function' || typeof instance.root !== 'function') {
                throw new Error(`Entry at index ${idx} is not a cheerio instance`);
            }
            return { $, root: instance.root() };
        });

        const dynamicPaths = [];
        const pathBuilder = [];

        const traverse = (nodes) => {
            const childrenBySample = nodes.map(({ node }) => this._getElementChildren(node));
            const expectedCount = childrenBySample[0].length;

            // Structure mismatch
            for (let i = 1; i < childrenBySample.length; i++) {
                if (childrenBySample[i].length !== expectedCount) {
                    throw new Error(`Structure mismatch at path ${pathBuilder.join('.')} (child count differs)`);
                }
            }

            for (let i = 0; i < expectedCount; i++) {
                const siblings = childrenBySample.map(arr => arr[i]);

                // All elements must be present
                if (siblings.some(sib => !sib)) {
                    throw new Error(`Structure mismatch at path ${pathBuilder.concat(i).join('.')}`);
                }

                // Compute signatures
                const signatures = siblings.map(({ $, el }) => this._signature($, el));
                const first = signatures[0];
                const allSame = signatures.every(sig => sig === first);

                pathBuilder.push(i);
                const currentPath = pathBuilder.join('.');

                if (!allSame) {
                    dynamicPaths.push(currentPath);
                    // Skip descending into dynamic nodes
                    pathBuilder.pop();
                    continue;
                }

                // Recurse
                traverse(siblings.map(({ $, el }) => ({ $, node: el })));
                pathBuilder.pop();
            }
        };

        traverse(roots.map(r => ({ $, node: r.root[0] })));

        return { dynamicPaths };
    }

    _getElementChildren(node) {
        if (!node || !node.children) return [];
        return node.children
            .filter(child => child.type === 'tag')
            .map(child => ({ $, el: child }));
    }

    _signature($, el) {
        const tag = (el.tagName || '').toLowerCase();
        const attrs = el.attribs || {};
        const normalizedAttrs = Object.keys(attrs)
            .sort()
            .map(key => {
                let value = attrs[key] || '';
                if (key === 'class') {
                    value = value
                        .split(/\s+/)
                        .filter(Boolean)
                        .sort()
                        .join(' ');
                }
                return `${key}=${value}`;
            })
            .join('|');

        const text = this._normalizeText($(el).text());
        return `${tag}|${normalizedAttrs}|${text}`;
    }

    _normalizeText(str) {
        if (!str) return '';
        return str.replace(/\s+/g, ' ').trim();
    }
}

module.exports = new SkeletonDiff();
