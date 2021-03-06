import { Value, qual, mkContractIdValue } from '@deondigital/api-client';
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

  addSelfIdAsValueArg = (contractIds: string[]) : [string, Value[]][] =>
    contractIds.map((id: string): [string, Value[]] => [
      id,
      [mkContractIdValue(id, 'self')],
    ])

  countContractsCmd = () =>
    this.requests.contracts().then((xs) => { console.log(xs.length); })

  listContractsByEventCountCmd = async (): Promise<void> => {
    const contractIds = await this.requests.contractIds();
    const contractIdsAndValueArgs = this.addSelfIdAsValueArg(contractIds);
    const sorted = await this.requests.sortByReport(
      contractIdsAndValueArgs,
      '\\cid -> List::length (getEvents cid)',
      intValueComparer,
    );
    for (const { id, value } of sorted) {
      console.log(`${id}    \tevent count: ${value == null ? 'null' : renderValue(value)}`);
    }
  }

  listContractsByLastTimestampCmd = async (): Promise<void> => {
    const contractIds = await this.requests.contractIds();
    const contractIdsAndValuesArgs = this.addSelfIdAsValueArg(contractIds);
    const reportSrc =
      'let val lastEvent = \\cid -> (\\Some x -> x) (List::last (const True) (getEvents cid)) \
      in \\cid -> (lastEvent cid).timestamp';
    const sorted = await this.requests.sortByReport(
      contractIdsAndValuesArgs, reportSrc, instantValueComparer);
    for (const { id, value } of sorted) {
      console.log(`${id}    \tlast timestamp: ${value == null ? 'N/A' : renderValue(value)}`);
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
    } catch (err) {
      console.error(err.message ? err.message : err);
      process.exit(1);
    }
  }

  residualCmd = async (id : string, options: { simplify: boolean }): Promise<void> =>
    console.log((await this.requests.residual(id, options.simplify)).csl)

  reportCmd = (csl: string, id : string | null): Promise<void> =>
    this.requests.report(id)(csl, [])
    .then(renderValue)
    .then(console.log)
    .catch((err) => {
      console.error(err.message ? err.message : err);
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
      } catch (err) {
        console.error(err.message ? err.message : err);
      }
      rl.prompt();
    });
  }

  instantiateCmd = async (
    declarationId: string,
    name: string,
    entryPoint: string,
    options: {
      args: string[],
      peers: string[],
    },
  ) => {
    if (options.args.length > 0) {
      console.error('Instantiating with expression arguments is not yet supported by 🚒');
      process.exit(1);
    }
    try {
      const { contractId } =
        await this.requests.instantiate(declarationId, name, [], qual(entryPoint), options.peers);
      console.log('Contract instantiated with id:');
      console.log(contractId);
    } catch (err) {
      console.error(err.message ? err.message : err);
      process.exit(1);
    }
  }

  declarationCmd = async (declarationId: string) => {
    try {
      const { csl } = await this.requests.getDeclaration(declarationId);
      console.log(csl);
    } catch (err) {
      console.error(err.message ? err.message : err);
      process.exit(1);
    }
  }

  reportReplCmd = (id : string | null) => this.reportRepl(
    (reportSrc: string) => this.requests.reportRendered(id)(reportSrc, []))

  getEventsCmd = async (id : string) => console.log(
    await this.requests.reportRendered(id)('getEvents', [mkContractIdValue(id, 'self')]))

  migrate = (eventTransformation: (v : Value) => Value) =>
    async (id1 : string, id2 : string) => {
      const targetState = {
        events: (await this.requests.getState(id1)).events.map(eventTransformation),
      };
      try {
        await this.targetRequests.loadState(id2, targetState);
      } catch (err) {
        console.error(`Unable to migrate state from contract ${id1} to contract ${id2}.`);
        console.error();
        console.error(err.message ? err.message : err);
        process.exit(1);
      }
    }

  migrateCmd = this.migrate(v => v);
}
