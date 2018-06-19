#!/usr/bin/env node

import { default as program } from 'commander';
import { DeonNodeRestClient } from 'deon-node-api-client';
import { Commands } from './commands';
import { Requests } from './requests';

const url : string =  process.env.FT_SERVICE || 'http://localhost:8080';
const targetUrl = process.env.FT_SERVICE_TARGET || url;

const commands = new Commands({
  requests: new Requests(new DeonNodeRestClient(url)),
  targetRequests: new Requests(new DeonNodeRestClient(targetUrl)),
});

program
  .description('🚒 The Deon Digital firetruck\n\n' +
               '  Uses service at FT_SERVICE if set, otherwise http://localhost:8080.\n\n' +
               `  FT_SERVICE=${process.env.FT_SERVICE || 'not set'}\n` +
               `  FT_SERVICE_TARGET=${process.env.FT_SERVICE_TARGET || 'not set'}\n`)
  .name('ft')
  .version(require('../package.json').version);

program
  .command('count')
  .description('Count instantiated contracts')
  .action(commands.countContractsCmd);

program
  .command('list')
  .alias('ls')
  .description('List instantiated contract ids')
  .action(commands.listContractsCmd);

program
  .command('list-by-event-count')
  .alias('lsc')
  .description('List instantiated contracts sorted by event count')
  .action(commands.listContractsByEventCountCmd);

program
  .command('list-by-latest-timestamp')
  .alias('lst')
  .description('List instantiated contracts sorted by most recently applied event')
  .action(commands.listContractsByLastTimestampCmd);

program
  .command('contract <id>')
  .alias('c')
  .description('Information about contract with <id>')
  .action(commands.contractInfoCmd);

program
  .command('residual <id>')
  .alias('r')
  .description('Print the residual contract with <id>')
  .option('-s, --simplify', 'Simplify residual contract')
  .action(commands.residualCmd);

program
  .command('report <csl> [id]')
  .alias('rp')
  .description('Evaluate report on contract with [id] (or no contract)')
  .action(commands.reportCmd);

program
  .command('repl [id]')
  .description('Report REPL (optionally) on a contract instance by [id]')
  .action(commands.reportReplCmd);

program
  .command('migrate <id1> <id2>')
  .description('Migrate events from contract with id1 to contract with id2. ' +
               'Uses FT_SERVICE_TARGET if set, otherwise same URL as first source contract.')
  .option(
    '--csl [eventsCsl]',
    'The CSL used to retrieve the events from the source', 'events')
  .action(commands.migrateCmd);

// error on unknown commands
program.on('command:*', () => {
  console.error(
    'Invalid command: %s\nSee --help for a list of available commands.',
    program.args.join(' '));
  process.exit(1);
});

// show help on no arguments
if (process.argv.slice(2).length === 0) {
  program.outputHelp();
  process.exit(1);
}

program.parse(process.argv);
