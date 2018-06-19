import { Value } from 'deon-api-client';
import { default as readline } from 'readline';
import { renderValue } from './pretty-print';
import { Requests } from './requests';
import { instantValueComparer, intValueComparer } from './value-compare';

export class Commands {
  private requests: Requests;
  private targetRequests: Requests;

  constructor({ requests, targetRequests } : { requests: Requests, targetRequests: Requests }) {
    this.requests = requests;
    this.targetRequests = targetRequests;
  }

  listContractsCmd = async (): Promise<void> => {
    const contractIds = await this.requests.contractIds();
    for (const c of contractIds) {
      console.log(c);
    }
  }

  countContractsCmd = () =>
    this.requests.contracts().then((xs) => { console.log(xs.length); })

  listContractsByEventCountCmd = async (): Promise<void> => {
    const contractIds = await this.requests.contractIds();
    const sorted = await this.requests.sortByReport(
      contractIds,
      'List::length events',
      intValueComparer,
    );
    for (const { id, value } of sorted) {
      console.log(`${id}       event count: ${value == null ? 'null' : renderValue(value)}`);
    }
  }

  listContractsByLastTimestampCmd = async (): Promise<void> => {
    const contractIds = await this.requests.contractIds();
    const reportSrc =
      'let val lastEvent = (\\Some x -> x) (List::last (const True) events) in lastEvent.timestamp';
    const sorted = await this.requests.sortByReport(contractIds, reportSrc, instantValueComparer);
    for (const { id, value } of sorted) {
      console.log(`${id}       last timestamp: ${value == null ? 'N/A' : renderValue(value)}`);
    }
  }

  contractInfoCmd = async (id : string): Promise<void> => {
    try {
      const contract = await this.requests.contract(id);
      console.log(contract);
      console.log();
      console.log('Number of applied events:');
      const numberOfEvents = await this.requests.numberOfEvents(id);
      console.log(numberOfEvents);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  }

  residualCmd = async (id : string, options: { simplify: boolean }): Promise<void> =>
    console.log((await this.requests.residual(id, options.simplify)).csl)

  reportCmd = (csl: string, id : string | null): Promise<void> =>
    this.requests.report(id)(csl)
    .then(renderValue)
    .then(console.log)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })

  reportRepl = async (evaluate : (csl: string) => Promise<string>): Promise<void> => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.prompt();
    rl.on('line', async (line) => {
      try {
        console.log(await evaluate(line));
      } catch (e) {
        console.error(e);
      }
      rl.prompt();
    });
  }

  reportReplCmd = (id : string | null) => this.reportRepl(this.requests.reportRendered(id));

  migrate = (eventTransformation: (v : Value) => Value) =>
    async (id1 : string, id2 : string, options: { csl: string }) => {
      const targetState = {
        events: (await this.requests.getState(id1, options.csl)).events.map(eventTransformation),
      };
      await this.targetRequests.loadState(id2, targetState);
    }

  migrateCmd = this.migrate(v => v);
}
