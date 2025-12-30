#ifndef LSH_H
#define LSH_H

#include <cstdint>
#include <vector>
#include <unordered_map>
#include <unordered_set>

namespace sigcluster {

/**
 * Locality-Sensitive Hashing index for SimHash signatures.
 * 
 * Divides signatures into bands and hashes each band to buckets.
 * Signatures that match in ANY band are candidate pairs for
 * detailed Hamming distance comparison.
 * 
 * Complexity: O(N) indexing, O(k) query where k = candidates
 * vs O(N²) brute-force all-pairs comparison.
 */
class LSHIndex {
public:
    /**
     * Create an LSH index.
     * @param numBands Number of bands to split signature into
     * @param bitsPerBand Bits per band (numBands * bitsPerBand should equal signature bits)
     */
    LSHIndex(uint32_t numBands = 32, uint32_t bitsPerBand = 16);
    
    /**
     * Add a signature to the index.
     * @param id Unique identifier for this signature
     * @param signature Pointer to signature bytes
     * @param signatureBytes Length of signature in bytes
     */
    void add(uint32_t id, const uint8_t* signature, size_t signatureBytes);
    
    /**
     * Find candidate IDs that might be similar to the query signature.
     * These are signatures that match in at least one band.
     * @param signature Query signature
     * @param signatureBytes Length of signature in bytes
     * @return Set of candidate IDs
     */
    std::unordered_set<uint32_t> findCandidates(const uint8_t* signature, size_t signatureBytes) const;
    
    /**
     * Find similar signatures within a Hamming distance threshold.
     * Uses LSH for candidate generation, then verifies with exact Hamming.
     * @param signature Query signature
     * @param signatureBytes Length of signature
     * @param allSignatures All indexed signatures (for verification)
     * @param threshold Maximum Hamming distance
     * @return Vector of {id, distance} pairs
     */
    std::vector<std::pair<uint32_t, uint32_t>> querySimilar(
        const uint8_t* signature,
        size_t signatureBytes,
        const std::vector<std::vector<uint8_t>>& allSignatures,
        uint32_t threshold
    ) const;
    
    /**
     * Clear all indexed signatures.
     */
    void clear();
    
    /**
     * Get statistics about the index.
     */
    struct Stats {
        uint32_t numSignatures;
        uint32_t numBands;
        uint32_t bitsPerBand;
        uint32_t totalBuckets;
        double avgBucketSize;
        uint32_t maxBucketSize;
    };
    Stats getStats() const;

private:
    uint32_t numBands_;
    uint32_t bitsPerBand_;
    uint32_t bytesPerBand_;
    
    // buckets_[band][bandHash] = vector of signature IDs
    std::vector<std::unordered_map<uint64_t, std::vector<uint32_t>>> buckets_;
    
    // Extract band hash from signature
    uint64_t extractBandHash(const uint8_t* signature, uint32_t bandIndex) const;
};

} // namespace sigcluster

#endif // LSH_H
