const fs = require('fs');
const path = require('path');
const { parseModule, collectFunctions } = require('../../../tools/dev/lib/swcAst');

describe('swcAst private method support', () => {
  test('collectFunctions captures private class methods', () => {
    const fixturePath = path.join(__dirname, '../../fixtures/tools/js-edit-nested-classes.js');
    const source = fs.readFileSync(fixturePath, 'utf8');
    const ast = parseModule(source, fixturePath);
    const { functions } = collectFunctions(ast, source);

    const privateMethod = functions.find((fn) => fn.canonicalName === 'exports.SecretBox > #increment');
    expect(privateMethod).toBeDefined();
    expect(privateMethod.scopeChain).toEqual(['exports', 'SecretBox', '#increment']);
    expect(privateMethod.pathSignature).toBe(
      'module.body[1].ExportDeclaration.declaration.ClassDeclaration.body[1].PrivateMethod.PrivateMethod'
    );
  });
});
