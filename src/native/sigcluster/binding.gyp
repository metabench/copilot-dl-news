{
  "targets": [{
    "target_name": "sigcluster",
    "sources": [
      "src/addon.cc",
      "src/hamming.cc",
      "src/lsh.cc"
    ],
    "include_dirs": [
      "<!@(node -p \"require('node-addon-api').include\")",
      "include"
    ],
    "dependencies": [
      "<!(node -p \"require('node-addon-api').gyp\")"
    ],
    "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
    "cflags": ["-O3", "-mpopcnt", "-fopenmp"],
    "cflags_cc": ["-O3", "-mpopcnt", "-std=c++17", "-fopenmp"],
    "ldflags": ["-fopenmp"],
    "conditions": [
      ["OS=='win'", {
        "msvs_settings": {
          "VCCLCompilerTool": {
            "AdditionalOptions": ["/O2", "/Oi", "/openmp"],
            "Optimization": 2,
            "InlineFunctionExpansion": 2,
            "EnableIntrinsicFunctions": "true"
          }
        }
      }],
      ["OS=='mac'", {
        "xcode_settings": {
          "GCC_OPTIMIZATION_LEVEL": "3",
          "OTHER_CFLAGS": ["-mpopcnt", "-Xpreprocessor", "-fopenmp"],
          "OTHER_LDFLAGS": ["-lomp"]
        }
      }]
    ]
  }]
}
