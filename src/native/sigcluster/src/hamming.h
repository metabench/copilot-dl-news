#ifndef HAMMING_H
#define HAMMING_H

#include <cstdint>
#include <cstddef>

namespace sigcluster {

/**
 * Compute Hamming distance between two byte arrays of equal length.
 * @param a First buffer
 * @param b Second buffer  
 * @param len Length in bytes (must be equal for both)
 * @return Number of differing bits
 */
uint32_t hamming_distance(const uint8_t* a, const uint8_t* b, size_t len);

/**
 * Compute Hamming distances from one target to N signatures.
 * Uses OpenMP parallelization when available.
 * @param target The reference signature
 * @param signatures Array of N signatures (contiguous memory)
 * @param n Number of signatures
 * @param sig_len Length of each signature in bytes
 * @param out_distances Output array of N distances (caller allocates)
 */
void batch_hamming(
    const uint8_t* target,
    const uint8_t* signatures,
    size_t n,
    size_t sig_len,
    uint32_t* out_distances
);

/**
 * Find all pairs with Hamming distance <= threshold.
 * Uses OpenMP parallelization when available.
 * Returns count of pairs found, fills pair_indices with (i, j) pairs.
 * @param signatures Array of N signatures
 * @param n Number of signatures
 * @param sig_len Length of each signature in bytes
 * @param threshold Maximum distance to consider similar
 * @param out_i Output array for first index of each pair
 * @param out_j Output array for second index of each pair
 * @param out_dist Output array for distance of each pair
 * @param max_pairs Maximum pairs to return
 * @return Number of pairs found
 */
size_t find_similar_pairs(
    const uint8_t* signatures,
    size_t n,
    size_t sig_len,
    uint32_t threshold,
    uint32_t* out_i,
    uint32_t* out_j,
    uint32_t* out_dist,
    size_t max_pairs
);

/**
 * Get the number of threads available for parallel operations.
 * @return Number of threads (1 if OpenMP not available)
 */
int get_thread_count();

/**
 * Set the number of threads to use for parallel operations.
 * @param n Number of threads
 */
void set_thread_count(int n);

} // namespace sigcluster

#endif // HAMMING_H
