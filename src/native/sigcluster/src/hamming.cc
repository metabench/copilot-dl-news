#include "hamming.h"
#include "../include/simd_compat.h"
#include <vector>
#include <algorithm>

#ifdef _OPENMP
#include <omp.h>
#endif

namespace sigcluster {

uint32_t hamming_distance(const uint8_t* a, const uint8_t* b, size_t len) {
    uint32_t dist = 0;
    
    // Process 8 bytes at a time using 64-bit popcount
    size_t i = 0;
    const size_t len64 = len & ~7ULL;  // Round down to multiple of 8
    
    const uint64_t* a64 = reinterpret_cast<const uint64_t*>(a);
    const uint64_t* b64 = reinterpret_cast<const uint64_t*>(b);
    
    for (; i < len64; i += 8) {
        dist += popcount64(*a64++ ^ *b64++);
    }
    
    // Handle remaining bytes
    for (; i < len; i++) {
        uint8_t xorVal = a[i] ^ b[i];
        // Byte-level popcount
        xorVal = (xorVal & 0x55) + ((xorVal >> 1) & 0x55);
        xorVal = (xorVal & 0x33) + ((xorVal >> 2) & 0x33);
        xorVal = (xorVal & 0x0f) + ((xorVal >> 4) & 0x0f);
        dist += xorVal;
    }
    
    return dist;
}

void batch_hamming(
    const uint8_t* target,
    const uint8_t* signatures,
    size_t n,
    size_t sig_len,
    uint32_t* out_distances
) {
    const int64_t count = static_cast<int64_t>(n);
    
    #ifdef _OPENMP
    #pragma omp parallel for schedule(static)
    #endif
    for (int64_t i = 0; i < count; i++) {
        out_distances[i] = hamming_distance(target, signatures + i * sig_len, sig_len);
    }
}

size_t find_similar_pairs(
    const uint8_t* signatures,
    size_t n,
    size_t sig_len,
    uint32_t threshold,
    uint32_t* out_i,
    uint32_t* out_j,
    uint32_t* out_dist,
    size_t max_pairs
) {
    // For parallel execution, each thread collects its own pairs
    // then we merge at the end
    
    #ifdef _OPENMP
    // Get number of threads
    int num_threads = omp_get_max_threads();
    
    // Thread-local storage for pairs
    std::vector<std::vector<uint32_t>> thread_i(num_threads);
    std::vector<std::vector<uint32_t>> thread_j(num_threads);
    std::vector<std::vector<uint32_t>> thread_dist(num_threads);
    
    // Reserve approximate space per thread
    size_t reserve_per_thread = max_pairs / num_threads + 1000;
    for (int t = 0; t < num_threads; t++) {
        thread_i[t].reserve(reserve_per_thread);
        thread_j[t].reserve(reserve_per_thread);
        thread_dist[t].reserve(reserve_per_thread);
    }
    
    #pragma omp parallel
    {
        int tid = omp_get_thread_num();
        auto& local_i = thread_i[tid];
        auto& local_j = thread_j[tid];
        auto& local_dist = thread_dist[tid];
        
        const int64_t count = static_cast<int64_t>(n);
        
        #pragma omp for schedule(dynamic, 16)
        for (int64_t i = 0; i < count; i++) {
            const uint8_t* sig_i = signatures + i * sig_len;
            
            for (size_t j = static_cast<size_t>(i) + 1; j < n; j++) {
                const uint8_t* sig_j = signatures + j * sig_len;
                uint32_t dist = hamming_distance(sig_i, sig_j, sig_len);
                
                if (dist <= threshold) {
                    local_i.push_back(static_cast<uint32_t>(i));
                    local_j.push_back(static_cast<uint32_t>(j));
                    local_dist.push_back(dist);
                }
            }
        }
    }
    
    // Merge results from all threads
    size_t count = 0;
    for (int t = 0; t < num_threads && count < max_pairs; t++) {
        size_t to_copy = std::min(thread_i[t].size(), max_pairs - count);
        for (size_t k = 0; k < to_copy; k++) {
            out_i[count] = thread_i[t][k];
            out_j[count] = thread_j[t][k];
            out_dist[count] = thread_dist[t][k];
            count++;
        }
    }
    
    return count;
    
    #else
    // Single-threaded fallback
    size_t count = 0;
    
    for (size_t i = 0; i < n && count < max_pairs; i++) {
        const uint8_t* sig_i = signatures + i * sig_len;
        
        for (size_t j = i + 1; j < n && count < max_pairs; j++) {
            const uint8_t* sig_j = signatures + j * sig_len;
            uint32_t dist = hamming_distance(sig_i, sig_j, sig_len);
            
            if (dist <= threshold) {
                out_i[count] = static_cast<uint32_t>(i);
                out_j[count] = static_cast<uint32_t>(j);
                out_dist[count] = dist;
                count++;
            }
        }
    }
    
    return count;
    #endif
}

// Query the number of threads available
int get_thread_count() {
    #ifdef _OPENMP
    return omp_get_max_threads();
    #else
    return 1;
    #endif
}

// Set the number of threads to use
void set_thread_count(int n) {
    #ifdef _OPENMP
    omp_set_num_threads(n);
    #endif
}

} // namespace sigcluster
