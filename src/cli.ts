#!/usr/bin/env node

import { Command } from 'commander';
import packageJson from '../package.json' with { type: 'json' };

const program = new Command();

program
  .name('plub')
  .description('Independently verify claims made by AI coding agents.')
  .version(packageJson.version);

program.parse();
