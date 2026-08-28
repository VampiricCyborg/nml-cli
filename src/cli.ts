#!/usr/bin/env node

import { Command } from 'commander';
import packageJson from '../package.json' with { type: 'json' };
import { extractClaim, formatClaimSummary } from './claim-parser.js';
import { checkCommit, checkRange, findGitRoot, formatCheckRangeSummary, formatCheckSummary, inferTestCommand } from './check.js';
import { installHook, uninstallHook } from './hooks.js';
import { formatSummary, VerificationError, verifyCommand } from './verifier.js';

const program = new Command();

program
  .name('plub')
  .description('Independently verify claims made by AI coding agents.')
  .version(packageJson.version);

program
  .command('check')
  .description('Check whether a commit truthfully claims that tests pass')
  .option('--test-cmd <command>', 'shell command to execute when a tests-pass claim is found')
  .option('--commit <ref>', 'commit/ref to inspect', 'HEAD')
  .option('--range <refs>', 'check commits in a ref range (for example main..feature)')
  .option('--cwd <path>', 'starting directory; defaults to the git root found from cwd')
  .option('--timeout <seconds>', 'test command timeout in seconds', '300')
  .option('--json', 'print the full receipt as JSON')
  .action(async (options: { commit: string; range?: string; testCmd?: string; cwd?: string; timeout: string; json?: boolean }) => {
    const timeoutSeconds = Number(options.timeout);
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
      throw new Error('Timeout must be a positive number of seconds.');
    }
    const cwd = await findGitRoot(options.cwd);
    const testCmd = options.testCmd ?? (await inferTestCommand(cwd));
    if (!testCmd) throw new Error('Unable to infer a test command. Pass --test-cmd explicitly.');
    if (options.range) {
      const receipts = await checkRange(options.range, { testCmd, cwd, timeoutMs: timeoutSeconds * 1000 });
      process.exitCode = receipts.some((receipt) => receipt.verdict === 'false_claim') ? 1 : 0;
      console.log(options.json ? JSON.stringify(receipts, null, 2) : formatCheckRangeSummary(receipts));
    } else {
      const receipt = await checkCommit({ commit: options.commit, testCmd, cwd, timeoutMs: timeoutSeconds * 1000 });
      process.exitCode = receipt.verdict === 'false_claim' ? 1 : 0;
      console.log(options.json ? JSON.stringify(receipt, null, 2) : formatCheckSummary(receipt));
    }
  });

program.command('install-hook').description('Install the plub pre-push hook')
  .option('--cwd <path>', 'repository directory', process.cwd()).action(async (options: { cwd: string }) => {
  console.log(`Installed plub pre-push hook at ${await installHook(options.cwd)}`);
});

program.command('uninstall-hook').description('Remove the plub pre-push hook')
  .option('--cwd <path>', 'repository directory', process.cwd()).action(async (options: { cwd: string }) => {
  console.log(`Removed plub pre-push hook at ${await uninstallHook(options.cwd)}`);
});

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
