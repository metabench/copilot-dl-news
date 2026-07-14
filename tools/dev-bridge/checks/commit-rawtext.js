'use strict';
// Commit + push the raw-text-element rendering fix in jsgui3-html.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'jsgui3-html'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

console.log(git(['status', '--porcelain']));
git(['add', '--',
  'html-core/text-node.js',
  'html-core/control-core.js',
  'test/core/raw_text_elements.test.js'
]);
git(['commit', '-m',
  'SSR: render <style>/<script> text children as raw text per HTML spec\n\n' +
  'style and script are RAW TEXT elements — browsers never decode entity\n' +
  'references inside them, so the previous entity-escaping of text children\n' +
  'corrupted injected CSS/JS. In practice every /* comment */ became\n' +
  '&#x2F;*…*&#x2F; and CSS error recovery silently discarded the rule after\n' +
  'each comment (seen on the copilot-dl-news crawl-status page; worked\n' +
  'around there with String_Control).\n\n' +
  'Text children of style/script now render unescaped in both paths\n' +
  '(Text_Node.all_html_render via parent tagName; render_content inline\n' +
  'strings). The correct raw-text sanitization is applied instead: any\n' +
  'case-insensitive "</style" / "</script" sequence in the content is\n' +
  'neutralized to "<\\/tag" so content cannot close the element early.\n' +
  'Normal elements keep full entity escaping; String_Control and the nx\n' +
  'flag are unchanged.\n\n' +
  'Regression tests: test/core/raw_text_elements.test.js (8 cases incl.\n' +
  'closing-tag neutralization, executable script round-trip, div escaping\n' +
  'unchanged, and Admin_Theme/Data_Table static CSS shipping intact).']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log(git(['push']).trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n')[0]);
