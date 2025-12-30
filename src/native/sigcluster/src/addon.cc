#include <napi.h>
#include "hamming.h"
#include "lsh.h"
#include <memory>
#include <map>

// Global LSH index storage (indexed by handle ID)
static std::map<uint32_t, std::unique_ptr<sigcluster::LSHIndex>> g_lshIndexes;
static std::map<uint32_t, std::vector<std::vector<uint8_t>>> g_lshSignatures;
static uint32_t g_nextHandle = 1;

/**
 * hamming(bufferA, bufferB) -> number
 * 
 * Compute Hamming distance between two Buffers of equal length.
 */
Napi::Value Hamming(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected 2 arguments: bufferA, bufferB")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    if (!info[0].IsBuffer() || !info[1].IsBuffer()) {
        Napi::TypeError::New(env, "Arguments must be Buffers")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    Napi::Buffer<uint8_t> bufA = info[0].As<Napi::Buffer<uint8_t>>();
    Napi::Buffer<uint8_t> bufB = info[1].As<Napi::Buffer<uint8_t>>();
    
    if (bufA.Length() != bufB.Length()) {
        Napi::TypeError::New(env, "Buffers must have equal length")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    uint32_t dist = sigcluster::hamming_distance(
        bufA.Data(), bufB.Data(), bufA.Length()
    );
    
    return Napi::Number::New(env, dist);
}

/**
 * batchHamming(target, signaturesArray) -> Uint32Array
 * 
 * Compute Hamming distance from target to each signature in array.
 * All signatures must have same length as target.
 */
Napi::Value BatchHamming(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected 2 arguments: target, signaturesArray")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    if (!info[0].IsBuffer()) {
        Napi::TypeError::New(env, "First argument must be a Buffer")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    if (!info[1].IsArray()) {
        Napi::TypeError::New(env, "Second argument must be an Array of Buffers")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    Napi::Buffer<uint8_t> target = info[0].As<Napi::Buffer<uint8_t>>();
    Napi::Array sigArray = info[1].As<Napi::Array>();
    size_t n = sigArray.Length();
    size_t sig_len = target.Length();
    
    if (n == 0) {
        return Napi::Uint32Array::New(env, 0);
    }
    
    // Copy signatures into contiguous memory for efficient access
    std::vector<uint8_t> signatures(n * sig_len);
    
    for (size_t i = 0; i < n; i++) {
        Napi::Value val = sigArray.Get(i);
        if (!val.IsBuffer()) {
            Napi::TypeError::New(env, "All array elements must be Buffers")
                .ThrowAsJavaScriptException();
            return env.Null();
        }
        Napi::Buffer<uint8_t> buf = val.As<Napi::Buffer<uint8_t>>();
        if (buf.Length() != sig_len) {
            Napi::TypeError::New(env, "All signatures must have same length as target")
                .ThrowAsJavaScriptException();
            return env.Null();
        }
        std::memcpy(signatures.data() + i * sig_len, buf.Data(), sig_len);
    }
    
    // Allocate output
    std::vector<uint32_t> distances(n);
    
    // Compute batch distances
    sigcluster::batch_hamming(
        target.Data(),
        signatures.data(),
        n,
        sig_len,
        distances.data()
    );
    
    // Create result array
    Napi::Uint32Array result = Napi::Uint32Array::New(env, n);
    for (size_t i = 0; i < n; i++) {
        result[i] = distances[i];
    }
    
    return result;
}

/**
 * findSimilarPairs(signaturesArray, threshold, maxPairs?) -> Array<{i, j, dist}>
 * 
 * Find all pairs of signatures with Hamming distance <= threshold.
 */
Napi::Value FindSimilarPairs(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected at least 2 arguments: signaturesArray, threshold")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    if (!info[0].IsArray()) {
        Napi::TypeError::New(env, "First argument must be an Array of Buffers")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    if (!info[1].IsNumber()) {
        Napi::TypeError::New(env, "Second argument must be a number (threshold)")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    Napi::Array sigArray = info[0].As<Napi::Array>();
    uint32_t threshold = info[1].As<Napi::Number>().Uint32Value();
    size_t n = sigArray.Length();
    
    // Default max pairs = n*(n-1)/2 (all possible pairs)
    size_t maxPairs = (n * (n - 1)) / 2;
    if (info.Length() >= 3 && info[2].IsNumber()) {
        maxPairs = info[2].As<Napi::Number>().Uint32Value();
    }
    
    if (n < 2) {
        return Napi::Array::New(env, 0);
    }
    
    // Get signature length from first element
    Napi::Value firstVal = sigArray.Get(static_cast<uint32_t>(0));
    if (!firstVal.IsBuffer()) {
        Napi::TypeError::New(env, "All array elements must be Buffers")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    size_t sig_len = firstVal.As<Napi::Buffer<uint8_t>>().Length();
    
    // Copy signatures into contiguous memory
    std::vector<uint8_t> signatures(n * sig_len);
    
    for (size_t i = 0; i < n; i++) {
        Napi::Value val = sigArray.Get(static_cast<uint32_t>(i));
        if (!val.IsBuffer()) {
            Napi::TypeError::New(env, "All array elements must be Buffers")
                .ThrowAsJavaScriptException();
            return env.Null();
        }
        Napi::Buffer<uint8_t> buf = val.As<Napi::Buffer<uint8_t>>();
        if (buf.Length() != sig_len) {
            Napi::TypeError::New(env, "All signatures must have same length")
                .ThrowAsJavaScriptException();
            return env.Null();
        }
        std::memcpy(signatures.data() + i * sig_len, buf.Data(), sig_len);
    }
    
    // Allocate output arrays
    std::vector<uint32_t> out_i(maxPairs);
    std::vector<uint32_t> out_j(maxPairs);
    std::vector<uint32_t> out_dist(maxPairs);
    
    // Find pairs
    size_t count = sigcluster::find_similar_pairs(
        signatures.data(),
        n,
        sig_len,
        threshold,
        out_i.data(),
        out_j.data(),
        out_dist.data(),
        maxPairs
    );
    
    // Build result array
    Napi::Array result = Napi::Array::New(env, count);
    for (size_t k = 0; k < count; k++) {
        Napi::Object pair = Napi::Object::New(env);
        pair.Set("i", Napi::Number::New(env, out_i[k]));
        pair.Set("j", Napi::Number::New(env, out_j[k]));
        pair.Set("dist", Napi::Number::New(env, out_dist[k]));
        result.Set(static_cast<uint32_t>(k), pair);
    }
    
    return result;
}

/**
 * createLSHIndex(numBands?, bitsPerBand?) -> handle (number)
 * 
 * Create a new LSH index for sub-linear similarity search.
 * Default: 32 bands × 16 bits = 512 bits (matches our signature size).
 */
Napi::Value CreateLSHIndex(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    uint32_t numBands = 32;
    uint32_t bitsPerBand = 16;
    
    if (info.Length() >= 1 && info[0].IsNumber()) {
        numBands = info[0].As<Napi::Number>().Uint32Value();
    }
    if (info.Length() >= 2 && info[1].IsNumber()) {
        bitsPerBand = info[1].As<Napi::Number>().Uint32Value();
    }
    
    uint32_t handle = g_nextHandle++;
    g_lshIndexes[handle] = std::make_unique<sigcluster::LSHIndex>(numBands, bitsPerBand);
    g_lshSignatures[handle] = std::vector<std::vector<uint8_t>>();
    
    return Napi::Number::New(env, handle);
}

/**
 * lshAdd(handle, signature) -> id (number)
 * 
 * Add a signature to the LSH index. Returns the assigned ID.
 */
Napi::Value LSHAdd(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected 2 arguments: handle, signature")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    if (!info[0].IsNumber()) {
        Napi::TypeError::New(env, "Handle must be a number")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    if (!info[1].IsBuffer()) {
        Napi::TypeError::New(env, "Signature must be a Buffer")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    uint32_t handle = info[0].As<Napi::Number>().Uint32Value();
    Napi::Buffer<uint8_t> sig = info[1].As<Napi::Buffer<uint8_t>>();
    
    auto it = g_lshIndexes.find(handle);
    if (it == g_lshIndexes.end()) {
        Napi::Error::New(env, "Invalid LSH index handle")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    // Store signature and get ID
    auto& sigs = g_lshSignatures[handle];
    uint32_t id = static_cast<uint32_t>(sigs.size());
    sigs.emplace_back(sig.Data(), sig.Data() + sig.Length());
    
    // Add to index
    it->second->add(id, sig.Data(), sig.Length());
    
    return Napi::Number::New(env, id);
}

/**
 * lshAddBatch(handle, signaturesArray) -> Array<id>
 * 
 * Add multiple signatures at once. Returns array of assigned IDs.
 */
Napi::Value LSHAddBatch(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected 2 arguments: handle, signaturesArray")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    if (!info[0].IsNumber()) {
        Napi::TypeError::New(env, "Handle must be a number")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    if (!info[1].IsArray()) {
        Napi::TypeError::New(env, "Second argument must be an Array of Buffers")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    uint32_t handle = info[0].As<Napi::Number>().Uint32Value();
    Napi::Array sigArray = info[1].As<Napi::Array>();
    
    auto it = g_lshIndexes.find(handle);
    if (it == g_lshIndexes.end()) {
        Napi::Error::New(env, "Invalid LSH index handle")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    auto& index = it->second;
    auto& sigs = g_lshSignatures[handle];
    size_t n = sigArray.Length();
    
    Napi::Array result = Napi::Array::New(env, n);
    
    for (size_t i = 0; i < n; i++) {
        Napi::Value val = sigArray.Get(static_cast<uint32_t>(i));
        if (!val.IsBuffer()) {
            Napi::TypeError::New(env, "All array elements must be Buffers")
                .ThrowAsJavaScriptException();
            return env.Null();
        }
        Napi::Buffer<uint8_t> buf = val.As<Napi::Buffer<uint8_t>>();
        
        uint32_t id = static_cast<uint32_t>(sigs.size());
        sigs.emplace_back(buf.Data(), buf.Data() + buf.Length());
        index->add(id, buf.Data(), buf.Length());
        
        result.Set(static_cast<uint32_t>(i), Napi::Number::New(env, id));
    }
    
    return result;
}

/**
 * lshQuery(handle, signature, threshold) -> Array<{id, dist}>
 * 
 * Find similar signatures using LSH candidate generation + exact verification.
 */
Napi::Value LSHQuery(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 3) {
        Napi::TypeError::New(env, "Expected 3 arguments: handle, signature, threshold")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    if (!info[0].IsNumber()) {
        Napi::TypeError::New(env, "Handle must be a number")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    if (!info[1].IsBuffer()) {
        Napi::TypeError::New(env, "Signature must be a Buffer")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    if (!info[2].IsNumber()) {
        Napi::TypeError::New(env, "Threshold must be a number")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    uint32_t handle = info[0].As<Napi::Number>().Uint32Value();
    Napi::Buffer<uint8_t> sig = info[1].As<Napi::Buffer<uint8_t>>();
    uint32_t threshold = info[2].As<Napi::Number>().Uint32Value();
    
    auto indexIt = g_lshIndexes.find(handle);
    auto sigsIt = g_lshSignatures.find(handle);
    
    if (indexIt == g_lshIndexes.end() || sigsIt == g_lshSignatures.end()) {
        Napi::Error::New(env, "Invalid LSH index handle")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    auto results = indexIt->second->querySimilar(
        sig.Data(), sig.Length(),
        sigsIt->second,
        threshold
    );
    
    Napi::Array result = Napi::Array::New(env, results.size());
    for (size_t i = 0; i < results.size(); i++) {
        Napi::Object item = Napi::Object::New(env);
        item.Set("id", Napi::Number::New(env, results[i].first));
        item.Set("dist", Napi::Number::New(env, results[i].second));
        result.Set(static_cast<uint32_t>(i), item);
    }
    
    return result;
}

/**
 * lshGetCandidates(handle, signature) -> Array<id>
 * 
 * Get candidate IDs without verification (for debugging/analysis).
 */
Napi::Value LSHGetCandidates(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected 2 arguments: handle, signature")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    uint32_t handle = info[0].As<Napi::Number>().Uint32Value();
    Napi::Buffer<uint8_t> sig = info[1].As<Napi::Buffer<uint8_t>>();
    
    auto it = g_lshIndexes.find(handle);
    if (it == g_lshIndexes.end()) {
        Napi::Error::New(env, "Invalid LSH index handle")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    auto candidates = it->second->findCandidates(sig.Data(), sig.Length());
    
    Napi::Array result = Napi::Array::New(env, candidates.size());
    uint32_t idx = 0;
    for (uint32_t id : candidates) {
        result.Set(idx++, Napi::Number::New(env, id));
    }
    
    return result;
}

/**
 * lshGetStats(handle) -> {numSignatures, numBands, bitsPerBand, totalBuckets, avgBucketSize, maxBucketSize}
 */
Napi::Value LSHGetStats(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Expected handle argument")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    uint32_t handle = info[0].As<Napi::Number>().Uint32Value();
    
    auto it = g_lshIndexes.find(handle);
    if (it == g_lshIndexes.end()) {
        Napi::Error::New(env, "Invalid LSH index handle")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    auto stats = it->second->getStats();
    
    Napi::Object result = Napi::Object::New(env);
    result.Set("numSignatures", Napi::Number::New(env, stats.numSignatures));
    result.Set("numBands", Napi::Number::New(env, stats.numBands));
    result.Set("bitsPerBand", Napi::Number::New(env, stats.bitsPerBand));
    result.Set("totalBuckets", Napi::Number::New(env, stats.totalBuckets));
    result.Set("avgBucketSize", Napi::Number::New(env, stats.avgBucketSize));
    result.Set("maxBucketSize", Napi::Number::New(env, stats.maxBucketSize));
    
    return result;
}

/**
 * lshDestroy(handle) -> void
 * 
 * Destroy an LSH index and free memory.
 */
Napi::Value LSHDestroy(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Expected handle argument")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    uint32_t handle = info[0].As<Napi::Number>().Uint32Value();
    
    g_lshIndexes.erase(handle);
    g_lshSignatures.erase(handle);
    
    return env.Undefined();
}

/**
 * Module initialization
 */
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    // Hamming distance functions
    exports.Set("hamming", Napi::Function::New(env, Hamming));
    exports.Set("batchHamming", Napi::Function::New(env, BatchHamming));
    exports.Set("findSimilarPairs", Napi::Function::New(env, FindSimilarPairs));
    
    // Thread control
    exports.Set("getThreadCount", Napi::Function::New(env, [](const Napi::CallbackInfo& info) {
        return Napi::Number::New(info.Env(), sigcluster::get_thread_count());
    }));
    exports.Set("setThreadCount", Napi::Function::New(env, [](const Napi::CallbackInfo& info) {
        if (info.Length() >= 1 && info[0].IsNumber()) {
            sigcluster::set_thread_count(info[0].As<Napi::Number>().Int32Value());
        }
        return info.Env().Undefined();
    }));
    
    // LSH index functions
    exports.Set("createLSHIndex", Napi::Function::New(env, CreateLSHIndex));
    exports.Set("lshAdd", Napi::Function::New(env, LSHAdd));
    exports.Set("lshAddBatch", Napi::Function::New(env, LSHAddBatch));
    exports.Set("lshQuery", Napi::Function::New(env, LSHQuery));
    exports.Set("lshGetCandidates", Napi::Function::New(env, LSHGetCandidates));
    exports.Set("lshGetStats", Napi::Function::New(env, LSHGetStats));
    exports.Set("lshDestroy", Napi::Function::New(env, LSHDestroy));
    
    return exports;
}

NODE_API_MODULE(sigcluster, Init)
