// deliberately unparseable — pins js-scan's parse-error reporting (c202).
// The two deps-of parse-error tests in tests/tools/__tests__/js-scan.test.js
// need at least one file in the repo that never parses; before this fixture
// they pinned whichever real file happened to be broken that month.
function ( {
