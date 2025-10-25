/**
 * @fileoverview A compact Jest reporter that focuses on concise failure summaries.
 */

const chalk = require('chalk');

class CompactReporter {
  constructor(globalConfig, options) {
    this._globalConfig = globalConfig;
    this._options = options;
  }

  onRunComplete(contexts, results) {
    const { numFailedTests, numPassedTests, numTotalTests, startTime } = results;
    const duration = (Date.now() - startTime) / 1000;

    if (numFailedTests > 0) {
      console.log(chalk.bold.red(`\nTests failed. Summary of ${numFailedTests} failures:`));
      results.testResults.forEach(testResult => {
        if (testResult.numFailingTests > 0) {
          this.printTestFailures(testResult);
        }
      });
    } else {
      console.log(chalk.bold.green(`\n✔ All ${numPassedTests}/${numTotalTests} tests passed in ${duration}s`));
    }
  }

  printTestFailures(testResult) {
    const filePath = testResult.testFilePath.replace(process.cwd(), '.');
    console.log(chalk.bold(`\n  ${filePath}`));

    testResult.testResults.forEach(result => {
      if (result.status === 'failed') {
        const title = result.ancestorTitles.join(' › ') + ' › ' + result.title;
        // Extract just the error message, not the stack trace
        const errorMessage = result.failureMessages[0]
          .split('\n')[0] // Get the first line of the error
          .replace(/.*Error: /, ''); // Clean up error prefix

        // Single line format: ✖ Test Name - Error message
        console.log(chalk.red(`    ✖ ${title}`) + chalk.gray(` - ${errorMessage}`));
      }
    });
  }
}

module.exports = CompactReporter;
