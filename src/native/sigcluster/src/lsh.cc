#include "lsh.h"
#include "hamming.h"
#include <algorithm>
#include <cstring>

namespace sigcluster {

LSHIndex::LSHIndex(uint32_t numBands, uint32_t bitsPerBand)
    : numBands_(numBands)
    , bitsPerBand_(bitsPerBand)
    , bytesPerBand_((bitsPerBand + 7) / 8)
    , buckets_(numBands)
{
}

uint64_t LSHIndex::extractBandHash(const uint8_t* signature, uint32_t bandIndex) const {
    // Calculate byte offset for this band
    size_t bitOffset = static_cast<size_t>(bandIndex) * bitsPerBand_;
    size_t byteOffset = bitOffset / 8;
    
    // Read up to 8 bytes (64 bits max per band)
    uint64_t hash = 0;
    size_t bytesToRead = std::min(bytesPerBand_, static_cast<uint32_t>(8));
    
    for (size_t i = 0; i < bytesToRead; i++) {
        hash |= static_cast<uint64_t>(signature[byteOffset + i]) << (i * 8);
    }
    
    // If bitsPerBand doesn't align to bytes, mask off extra bits
    if (bitsPerBand_ < 64) {
        uint64_t mask = (1ULL << bitsPerBand_) - 1;
        hash &= mask;
    }
    
    return hash;
}

void LSHIndex::add(uint32_t id, const uint8_t* signature, size_t signatureBytes) {
    // Ensure we have enough bytes for all bands
    size_t requiredBytes = (static_cast<size_t>(numBands_) * bitsPerBand_ + 7) / 8;
    if (signatureBytes < requiredBytes) {
        return; // Signature too short
    }
    
    // Add to each band's bucket
    for (uint32_t b = 0; b < numBands_; b++) {
        uint64_t bandHash = extractBandHash(signature, b);
        buckets_[b][bandHash].push_back(id);
    }
}

std::unordered_set<uint32_t> LSHIndex::findCandidates(const uint8_t* signature, size_t signatureBytes) const {
    std::unordered_set<uint32_t> candidates;
    
    size_t requiredBytes = (static_cast<size_t>(numBands_) * bitsPerBand_ + 7) / 8;
    if (signatureBytes < requiredBytes) {
        return candidates;
    }
    
    for (uint32_t b = 0; b < numBands_; b++) {
        uint64_t bandHash = extractBandHash(signature, b);
        
        auto& bucket = buckets_[b];
        auto it = bucket.find(bandHash);
        if (it != bucket.end()) {
            for (uint32_t id : it->second) {
                candidates.insert(id);
            }
        }
    }
    
    return candidates;
}

std::vector<std::pair<uint32_t, uint32_t>> LSHIndex::querySimilar(
    const uint8_t* signature,
    size_t signatureBytes,
    const std::vector<std::vector<uint8_t>>& allSignatures,
    uint32_t threshold
) const {
    std::vector<std::pair<uint32_t, uint32_t>> results;
    
    // Get candidates via LSH
    auto candidates = findCandidates(signature, signatureBytes);
    
    // Verify each candidate with exact Hamming distance
    for (uint32_t id : candidates) {
        if (id < allSignatures.size()) {
            const auto& candidateSig = allSignatures[id];
            size_t compareBytes = std::min(signatureBytes, candidateSig.size());
            
            uint32_t dist = hamming_distance(signature, candidateSig.data(), compareBytes);
            
            if (dist <= threshold) {
                results.push_back({id, dist});
            }
        }
    }
    
    // Sort by distance
    std::sort(results.begin(), results.end(),
        [](const auto& a, const auto& b) { return a.second < b.second; });
    
    return results;
}

void LSHIndex::clear() {
    for (auto& bucket : buckets_) {
        bucket.clear();
    }
}

LSHIndex::Stats LSHIndex::getStats() const {
    Stats stats = {};
    stats.numBands = numBands_;
    stats.bitsPerBand = bitsPerBand_;
    
    uint32_t totalSignatures = 0;
    uint32_t maxBucket = 0;
    uint64_t totalBucketSizes = 0;
    
    for (const auto& bandBuckets : buckets_) {
        stats.totalBuckets += static_cast<uint32_t>(bandBuckets.size());
        
        for (const auto& [hash, ids] : bandBuckets) {
            uint32_t size = static_cast<uint32_t>(ids.size());
            totalBucketSizes += size;
            maxBucket = std::max(maxBucket, size);
        }
    }
    
    // Count unique signatures (from band 0)
    if (!buckets_.empty()) {
        for (const auto& [hash, ids] : buckets_[0]) {
            totalSignatures += static_cast<uint32_t>(ids.size());
        }
    }
    
    stats.numSignatures = totalSignatures;
    stats.maxBucketSize = maxBucket;
    stats.avgBucketSize = stats.totalBuckets > 0 
        ? static_cast<double>(totalBucketSizes) / stats.totalBuckets 
        : 0.0;
    
    return stats;
}

} // namespace sigcluster
