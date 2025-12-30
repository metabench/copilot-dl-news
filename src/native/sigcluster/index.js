/**
 * sigcluster - SIMD-optimized signature clustering
 * 
 * Provides fast Hamming distance computation for page clustering.
 */

let native = null;
let loadError = null;

try {
    native = require('./build/Release/sigcluster.node');
} catch (e) {
    try {
        native = require('./build/Debug/sigcluster.node');
    } catch (e2) {
        loadError = e;
    }
}

/**
 * Check if native module is available
 * @returns {boolean}
 */
function isAvailable() {
    return native !== null;
}

/**
 * Get the load error if native module failed to load
 * @returns {Error|null}
 */
function getLoadError() {
    return loadError;
}

/**
 * Compute Hamming distance between two Buffers
 * @param {Buffer} a 
 * @param {Buffer} b 
 * @returns {number} Number of differing bits
 */
function hamming(a, b) {
    if (!native) {
        throw new Error('Native module not loaded: ' + (loadError?.message || 'unknown error'));
    }
    return native.hamming(a, b);
}

/**
 * Compute Hamming distances from target to array of signatures
 * @param {Buffer} target 
 * @param {Buffer[]} signatures 
 * @returns {Uint32Array} Distance to each signature
 */
function batchHamming(target, signatures) {
    if (!native) {
        throw new Error('Native module not loaded: ' + (loadError?.message || 'unknown error'));
    }
    return native.batchHamming(target, signatures);
}

/**
 * Find all pairs with Hamming distance <= threshold
 * @param {Buffer[]} signatures 
 * @param {number} threshold 
 * @param {number} [maxPairs] Maximum pairs to return (default: all)
 * @returns {Array<{i: number, j: number, dist: number}>}
 */
function findSimilarPairs(signatures, threshold, maxPairs) {
    if (!native) {
        throw new Error('Native module not loaded: ' + (loadError?.message || 'unknown error'));
    }
    if (maxPairs !== undefined) {
        return native.findSimilarPairs(signatures, threshold, maxPairs);
    }
    return native.findSimilarPairs(signatures, threshold);
}

/**
 * Get the number of threads used for parallel operations
 * @returns {number}
 */
function getThreadCount() {
    if (!native) return 1;
    return native.getThreadCount();
}

/**
 * Set the number of threads to use for parallel operations
 * @param {number} n
 */
function setThreadCount(n) {
    if (native) {
        native.setThreadCount(n);
    }
}

// JavaScript fallback implementations for when native isn't available

/**
 * JS fallback: Hamming distance
 */
function hammingJS(a, b) {
    let dist = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        let xor = a[i] ^ b[i];
        while (xor) {
            dist += xor & 1;
            xor >>= 1;
        }
    }
    return dist;
}

/**
 * JS fallback: Batch Hamming
 */
function batchHammingJS(target, signatures) {
    const distances = new Uint32Array(signatures.length);
    for (let i = 0; i < signatures.length; i++) {
        distances[i] = hammingJS(target, signatures[i]);
    }
    return distances;
}

/**
 * JS fallback: Find similar pairs
 */
function findSimilarPairsJS(signatures, threshold, maxPairs = Infinity) {
    const pairs = [];
    const n = signatures.length;
    
    for (let i = 0; i < n && pairs.length < maxPairs; i++) {
        for (let j = i + 1; j < n && pairs.length < maxPairs; j++) {
            const dist = hammingJS(signatures[i], signatures[j]);
            if (dist <= threshold) {
                pairs.push({ i, j, dist });
            }
        }
    }
    
    return pairs;
}

// ============================================================
// LSH (Locality-Sensitive Hashing) API
// ============================================================

/**
 * Create an LSH index for sub-linear similarity search.
 * 
 * Instead of O(N²) all-pairs comparison, LSH uses band hashing to
 * identify candidate pairs in O(N) time, then verifies candidates
 * with exact Hamming distance.
 * 
 * @param {object} [options]
 * @param {number} [options.bands=32] Number of bands to split signature into
 * @param {number} [options.bitsPerBand=16] Bits per band (bands × bitsPerBand = signature bits)
 * @returns {LSHIndex}
 */
function createLSHIndex(options = {}) {
    const bands = options.bands || 32;
    const bitsPerBand = options.bitsPerBand || 16;
    
    if (native) {
        const handle = native.createLSHIndex(bands, bitsPerBand);
        return new LSHIndex(handle, bands, bitsPerBand, false);
    } else {
        return new LSHIndex(null, bands, bitsPerBand, true);
    }
}

/**
 * LSH Index class - wraps either native or JS implementation
 */
class LSHIndex {
    constructor(handle, bands, bitsPerBand, isJS) {
        this._handle = handle;
        this._bands = bands;
        this._bitsPerBand = bitsPerBand;
        this._isJS = isJS;
        this._destroyed = false;
        
        // JS fallback storage
        if (isJS) {
            this._buckets = Array.from({ length: bands }, () => new Map());
            this._signatures = [];
        }
    }
    
    /**
     * Check if this index uses the native implementation
     * @returns {boolean}
     */
    get isNative() {
        return !this._isJS;
    }
    
    /**
     * Add a signature to the index
     * @param {Buffer} signature
     * @returns {number} Assigned ID
     */
    add(signature) {
        if (this._destroyed) throw new Error('Index has been destroyed');
        
        if (this._isJS) {
            const id = this._signatures.length;
            this._signatures.push(Buffer.from(signature));
            
            // Add to each band's bucket
            for (let b = 0; b < this._bands; b++) {
                const bandHash = this._extractBandHash(signature, b);
                if (!this._buckets[b].has(bandHash)) {
                    this._buckets[b].set(bandHash, []);
                }
                this._buckets[b].get(bandHash).push(id);
            }
            
            return id;
        } else {
            return native.lshAdd(this._handle, signature);
        }
    }
    
    /**
     * Add multiple signatures at once
     * @param {Buffer[]} signatures
     * @returns {number[]} Assigned IDs
     */
    addBatch(signatures) {
        if (this._destroyed) throw new Error('Index has been destroyed');
        
        if (this._isJS) {
            return signatures.map(sig => this.add(sig));
        } else {
            return Array.from(native.lshAddBatch(this._handle, signatures));
        }
    }
    
    /**
     * Find similar signatures using LSH + verification
     * @param {Buffer} signature Query signature
     * @param {number} threshold Maximum Hamming distance
     * @returns {Array<{id: number, dist: number}>} Similar signatures sorted by distance
     */
    query(signature, threshold) {
        if (this._destroyed) throw new Error('Index has been destroyed');
        
        if (this._isJS) {
            // Get candidates
            const candidates = this.getCandidates(signature);
            
            // Verify each candidate
            const results = [];
            for (const id of candidates) {
                const dist = hammingJS(signature, this._signatures[id]);
                if (dist <= threshold) {
                    results.push({ id, dist });
                }
            }
            
            // Sort by distance
            results.sort((a, b) => a.dist - b.dist);
            return results;
        } else {
            return native.lshQuery(this._handle, signature, threshold);
        }
    }
    
    /**
     * Get candidate IDs (without verification) - for analysis/debugging
     * @param {Buffer} signature
     * @returns {number[]} Candidate IDs
     */
    getCandidates(signature) {
        if (this._destroyed) throw new Error('Index has been destroyed');
        
        if (this._isJS) {
            const candidates = new Set();
            
            for (let b = 0; b < this._bands; b++) {
                const bandHash = this._extractBandHash(signature, b);
                const bucket = this._buckets[b].get(bandHash);
                if (bucket) {
                    bucket.forEach(id => candidates.add(id));
                }
            }
            
            return Array.from(candidates);
        } else {
            return Array.from(native.lshGetCandidates(this._handle, signature));
        }
    }
    
    /**
     * Get index statistics
     * @returns {{numSignatures: number, numBands: number, bitsPerBand: number, totalBuckets: number, avgBucketSize: number, maxBucketSize: number}}
     */
    getStats() {
        if (this._destroyed) throw new Error('Index has been destroyed');
        
        if (this._isJS) {
            let totalBuckets = 0;
            let maxBucketSize = 0;
            let totalBucketSizes = 0;
            
            for (const bandBuckets of this._buckets) {
                totalBuckets += bandBuckets.size;
                for (const [, ids] of bandBuckets) {
                    totalBucketSizes += ids.length;
                    maxBucketSize = Math.max(maxBucketSize, ids.length);
                }
            }
            
            return {
                numSignatures: this._signatures.length,
                numBands: this._bands,
                bitsPerBand: this._bitsPerBand,
                totalBuckets,
                avgBucketSize: totalBuckets > 0 ? totalBucketSizes / totalBuckets : 0,
                maxBucketSize
            };
        } else {
            return native.lshGetStats(this._handle);
        }
    }
    
    /**
     * Destroy the index and free resources
     */
    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        
        if (!this._isJS && native) {
            native.lshDestroy(this._handle);
        }
        
        // Clear JS storage
        this._buckets = null;
        this._signatures = null;
    }
    
    /**
     * Extract band hash from signature (JS implementation)
     * @private
     */
    _extractBandHash(signature, bandIndex) {
        const bitsPerBand = this._bitsPerBand;
        const bitOffset = bandIndex * bitsPerBand;
        const byteOffset = Math.floor(bitOffset / 8);
        
        // Read up to 8 bytes as a BigInt for proper 64-bit handling
        let hash = 0n;
        const bytesToRead = Math.min(Math.ceil(bitsPerBand / 8), 8, signature.length - byteOffset);
        
        for (let i = 0; i < bytesToRead; i++) {
            hash |= BigInt(signature[byteOffset + i]) << BigInt(i * 8);
        }
        
        // Mask to bitsPerBand
        if (bitsPerBand < 64) {
            hash &= (1n << BigInt(bitsPerBand)) - 1n;
        }
        
        // Convert to number for Map key (safe for up to 53 bits)
        return Number(hash);
    }
}

module.exports = {
    isAvailable,
    getLoadError,
    hamming,
    batchHamming,
    findSimilarPairs,
    getThreadCount,
    setThreadCount,
    
    // LSH API
    createLSHIndex,
    LSHIndex,
    
    // Fallbacks
    hammingJS,
    batchHammingJS,
    findSimilarPairsJS
};
