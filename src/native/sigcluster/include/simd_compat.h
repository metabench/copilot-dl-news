#ifndef SIMD_COMPAT_H
#define SIMD_COMPAT_H

#include <cstdint>

// Detect platform and available SIMD
#if defined(_MSC_VER)
    // MSVC
    #include <intrin.h>
    #define SIGCLUSTER_MSVC 1
#elif defined(__GNUC__) || defined(__clang__)
    // GCC/Clang
    #if defined(__x86_64__) || defined(_M_X64) || defined(__i386__) || defined(_M_IX86)
        #include <x86intrin.h>
        #define SIGCLUSTER_X86 1
    #elif defined(__ARM_NEON) || defined(__aarch64__)
        #include <arm_neon.h>
        #define SIGCLUSTER_NEON 1
    #endif
#endif

namespace sigcluster {

/**
 * Portable popcount for 64-bit integers.
 * Uses hardware instruction when available, falls back to bit manipulation.
 */
inline uint32_t popcount64(uint64_t x) {
#if defined(SIGCLUSTER_MSVC)
    // MSVC intrinsic
    return static_cast<uint32_t>(__popcnt64(x));
#elif defined(__POPCNT__) || defined(SIGCLUSTER_X86)
    // GCC/Clang with POPCNT support
    return static_cast<uint32_t>(__builtin_popcountll(x));
#else
    // Portable fallback (Hamming weight algorithm)
    x = x - ((x >> 1) & 0x5555555555555555ULL);
    x = (x & 0x3333333333333333ULL) + ((x >> 2) & 0x3333333333333333ULL);
    x = (x + (x >> 4)) & 0x0f0f0f0f0f0f0f0fULL;
    return static_cast<uint32_t>((x * 0x0101010101010101ULL) >> 56);
#endif
}

/**
 * Hamming distance between two 64-bit values.
 */
inline uint32_t hamming64(uint64_t a, uint64_t b) {
    return popcount64(a ^ b);
}

} // namespace sigcluster

#endif // SIMD_COMPAT_H
