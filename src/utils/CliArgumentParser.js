/**
 * CliArgumentParser — Commander.js wrapper for standardized CLI argument parsing.
 * 
 * Provides a simpler, more consistent API across all CLI tools using commander.js.
 * Handles schema validation, type coercion, and help generation automatically.
 * 
 * @example
 * const parser = new CliArgumentParser('validate-gazetteer', 'Validate gazetteer data');
 * parser.add('--db <path>', 'Database path', 'data/gazetteer.db');
 * parser.add('--details', 'Print detailed output', false, 'boolean');
 * parser.add('--fix', 'Apply fixes', false, 'boolean');
 * 
 * const args = parser.parse(process.argv);
 * console.log(args.db, args.details, args.fix);
 */

const { program } = require('commander');

class CliArgumentParser {
  /**
   * Create a new argument parser.
   * @param {string} toolName Name of the CLI tool (for help/version)
   * @param {string} description Tool description
   * @param {string} [version='1.0.0'] Tool version
   */
  constructor(toolName, description, version = '1.0.0') {
    this.toolName = toolName;
    this.description = description;
    this.version = version;
    this.program = program
      .name(toolName)
      .description(description)
      .version(version)
      .allowExcessArguments(true);
  }

  /**
   * Add a command-line option to the parser.
   * 
   * @param {string} flags Option flags (e.g., '--db <path>', '-d', '--json')
   * @param {string} description Option description (for help)
   * @param {*} [defaultValue] Default value if not provided
   * @param {string} [type='string'] Type: 'string', 'number', 'boolean'
   * @returns {CliArgumentParser} This instance (for chaining)
   * 
   * @example
   * parser
   *   .add('--db <path>', 'Database path', 'data/news.db')
   *   .add('--limit <number>', 'Limit results', 100, 'number')
   *   .add('--json', 'Output as JSON', false, 'boolean')
   *   .add('--verbose, -v', 'Verbose output', false, 'boolean');
   */
  add(flags, description, defaultValue, type = 'string') {
    // For variadic arguments, commander.js collects them into an array automatically.
    // No special handling is needed here; just pass the flags to createOption.
    const option = this.program.createOption(flags, description);

    let parserFn = null;
    if (typeof type === 'function') {
      parserFn = type;
    } else if (!flags.includes('...')) {
      const normalizedType = String(type || '').toLowerCase();
      switch (normalizedType) {
        case 'int':
        case 'integer':
        case 'number':
          parserFn = (value) => {
            const parsed = Number.parseInt(value, 10);
            if (Number.isNaN(parsed)) {
              throw new Error(`Expected a number for ${flags}, received "${value}"`);
            }
            return parsed;
          };
          break;
        case 'float':
        case 'double':
          parserFn = (value) => {
            const parsed = Number.parseFloat(value);
            if (Number.isNaN(parsed)) {
              throw new Error(`Expected a decimal number for ${flags}, received "${value}"`);
            }
            return parsed;
          };
          break;
        case 'boolean':
          if (flags.includes('<') || flags.includes('[')) {
              parserFn = (value) => {
                  if (value === undefined) return true;
                  const normalized = String(value).trim().toLowerCase();
                  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
                  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
                  throw new Error(`Expected a boolean for ${flags}, received "${value}"`);
              };
          }
          break;
        default:
          parserFn = null;
      }
    }

    if (parserFn) {
      option.argParser(parserFn);
    }

    if (defaultValue !== undefined) {
      option.default(defaultValue);
    }

    this.program.addOption(option);
    return this;
  }

  /**
   * Parse command-line arguments and return an options object.
   * 
   * @param {string[]} argv Raw process.argv (e.g., process.argv)
   * @returns {Object} Parsed options object with all flags
   * 
   * @example
   * const args = parser.parse(process.argv);
   * console.log(args.db); // 'data/news.db'
   * console.log(args.json); // true or false
   */
  parse(argv) {
    const arrayArgv = Array.isArray(argv) ? argv : [];
    const parsedArgv = arrayArgv.length ? arrayArgv : process.argv;

    this.program.parse(parsedArgv, { from: 'user' });

    const options = this.program.opts();
    return {
      ...options,
      positional: [...this.program.args],
    };
  }

  /**
   * Parse and validate options. Throws error if required options missing.
   * 
   * @param {string[]} argv Raw process.argv
   * @param {string[]} requiredOptions Array of option names that must be provided
   * @returns {Object} Parsed options
   * @throws {Error} If required options are missing
   * 
   * @example
   * const args = parser.parseRequired(process.argv, ['db', 'url']);
   */
  parseRequired(argv, requiredOptions = []) {
    const opts = this.parse(argv);

    for (const opt of requiredOptions) {
      if (opts[opt] === undefined || opts[opt] === null) {
        console.error(`Error: Missing required option: --${opt}`);
        process.exit(1);
      }
    }

    return opts;
  }

  /**
   * Get the underlying commander program for advanced customization.
   * @returns {Command} Commander program instance
   */
  getProgram() {
    return this.program;
  }
}

module.exports = { CliArgumentParser };
