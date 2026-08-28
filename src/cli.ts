#!/usr/bin/env node

import { Command } from 'commander';
import packageJson from '../package.json' with { type: 'json' };
import { extractClaim, formatClaimSummary } from './claim-parser.js';
import { formatSummary, VerificationError, verifyCommand } from './verifier.js';

const program = new Command();

program
  .name('plub')
  .description('Independently verify claims made by AI coding agents.')
  .version(packageJson.version);

program
  .command('verify')
  .description('Run a command and independently record its result')
  .requiredOption('--cmd <command>', 'shell command to execute')
  .option('--cwd <path>', 'working directory for the command', process.cwd())
  .option('--timeout <seconds>', 'timeout in seconds', '300')
  .option('--json', 'print the structured result as JSON')
  .action(async (options: { cmd: string; cwd: string; timeout: string; json?: boolean }) => {
    const timeoutSeconds = Number(options.timeout);
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
      throw new VerificationError('Timeout must be a positive number of seconds.');
    }
    const result = await verifyCommand(options.cmd, options.cwd, timeoutSeconds * 1000);
    process.exitCode = result.passed ? 0 : 1;
    console.log(options.json ? JSON.stringify(result, null, 2) : formatSummary(result));
  });

program
  .command('extract-claim')
  .description('Detect a tests-pass claim in text')
  .argument('[text]', 'text to inspect')
  .option('--stdin', 'read the source text from stdin')
  .option('--json', 'print the structured claim as JSON')
  .action(async (text: string | undefined, options: { stdin?: boolean; json?: boolean }) => {
    let sourceText = text ?? '';
    if (options.stdin || text === undefined) {
      sourceText = '';
      for await (const chunk of process.stdin) sourceText += chunk.toString();
    }
    const claim = extractClaim(sourceText);
    console.log(options.json ? JSON.stringify(claim, null, 2) : formatClaimSummary(claim));
  });

try {
  await program.parseAsync();
} catch (error) {
  process.exitCode = 1;
  console.error(error instanceof Error ? error.message : String(error));
}
