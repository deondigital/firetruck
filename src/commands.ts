import {
  IntValue,
  Value,
  ListValue,
  RecordValue,
  Contract,
  ResidualSource,
  QualifiedName,
  qual,
  mkStringValue,
} from 'deon-api-client';
import { DeonNodeRestClient } from 'deon-node-api-client';
import { renderValue } from './pretty-print';
import { default as readline } from 'readline';
import util from 'util';

const url : string =  process.env.FT_SERVICE || 'http://localhost:8080';
const client = new DeonNodeRestClient(url);

const listContractInfo = async (): Promise<Contract[]> => {
  const response = await client.contracts.getAll();
  if (response.ok && response.data) {
    return response.data;
  }
  throw Error(`Bad response from server.\n${util.inspect(response)}}`);
};

const listContracts = async (): Promise<string[]> =>
  (await listContractInfo()).map(c => c.id);

export const listContractsCmd = async (): Promise<void> => {
  const contractIds = await listContracts();
  for (const c of contractIds) {
    console.log(c);
  }
};

const countContracts = async (): Promise<number> => (await listContractInfo()).length;

export const countContractsCmd = () => countContracts().then(console.log);

const mapReport = async (
  contractIds: string[],
  csl: string,
): Promise<{ id: string, value: Value | null }[]> =>
  Promise.all(contractIds.map(async (id) => {
    const response = await client.contracts.reportOnContract(id, { csl });
    const value = response.ok ? response.data as Value : null;
    return { id, value };
  }));

const sortByReport = async (
  contractIds: string[],
  csl: string,
  valueComparer: (a: Value | null, b: Value | null) => number,
): Promise<{ id: string, value: Value | null}[]> => {
  const idsWithValues = await mapReport(contractIds, csl);
  idsWithValues.sort((a, b) => valueComparer(a.value, b.value));
  return idsWithValues;
};

export const listContractsByEventCountCmd = async (): Promise<void> => {
  const contractIds = await listContracts();
  const csl = 'List::length events';
  const valueComparer = (a: Value | null, b: Value | null) => {
    if (a == null || a.class !== 'IntValue') {
      if (b == null || b.class !== 'IntValue') {
        return 0;
      }
      return -1;
    }
    if (b == null || b.class !== 'IntValue') {
      return 1;
    }
    return a.i - b.i;
  };
  const sorted = await sortByReport(contractIds, csl, valueComparer);
  for (const { id, value } of sorted) {
    console.log(`${id}       event count: ${value == null ? 'null' : renderValue(value)}`);
  }
};

export const listContractsByLastTimestampCmd = async (): Promise<void> => {
  const contractIds = await listContracts();
  const csl =
    'let val lastEvent = (\\Some x -> x) (List::last (const True) events) in lastEvent.timestamp';
  const valueComparer = (a: Value | null, b: Value | null) => {
    if (a == null || a.class !== 'InstantValue') {
      if (b == null || b.class !== 'InstantValue') {
        return 0;
      }
      return -1;
    }
    if (b == null || b.class !== 'InstantValue') {
      return 1;
    }
    return a.instant < b.instant ? -1 : (a.instant > b.instant ? 1 : 0);
  };
  const sorted = await sortByReport(contractIds, csl, valueComparer);
  for (const { id, value } of sorted) {
    console.log(`${id}       last timestamp: ${value == null ? 'N/A' : renderValue(value)}`);
  }
};

export const contractInfoCmd = async (id : string): Promise<void> => {
  const r = await client.contracts.get(id);
  if (r.ok && r.data) {
    console.log(r.data);
    console.log();
    console.log('Number of applied events:');
    const events = await client.contracts.reportOnContract(id, { csl: 'List::length events' });
    console.log((events.data as IntValue).i);
  } else {
    console.error(`Could not find contract with id: ${id}`);
    process.exit(1);
  }
};

const getResidual = async (id : string, simplified : boolean): Promise<ResidualSource> => {
  const r = await client.contracts.src(id, simplified);
  if (r.ok && r.data) {
    return r.data;
  } if (r.statusCode === 404) {
    throw Error(`Could not find contract with id: ${id}`);
  }
  throw Error(`Could not retrieve simplified contract for contract with id: ${id}`);
};

export const residualCmd = async (id : string, options: { simplify: boolean }): Promise<void> =>
  console.log((await getResidual(id, options.simplify)).csl);

const report = (id : string | null) => async (csl : string): Promise<Value> => {
  const r = id == null
    ? await client.contracts.report({ csl })
    : await client.contracts.reportOnContract(id, { csl });
  if (r.ok && r.data) {
    return r.data;
  }
  if (r.statusCode === 404) {
    throw Error(`Could not find contract with id: ${id}`);
  }
  throw Error(`Unexpected error: ${util.inspect(r)}`);
};

const reportRendered = (id : string | null) => async (csl : string): Promise<string> =>
  renderValue(await report(id)(csl));

export const reportCmd = (csl: string, id : string | null): Promise<void> =>
  report(id)(csl)
  .then(renderValue)
  .then(console.log)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

const reportRepl = async (evaluate : (csl: string) => Promise<string>): Promise<void> => {
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
};

export const reportReplCmd = (id : string | null) => reportRepl(reportRendered(id));

type ContractState = {
  events: Value[],
};

const getState = async (id : string, eventsCsl : string = 'events'): Promise<ContractState> => {
  const eventsValue = await report(id)(eventsCsl) as ListValue;
  const events = eventsValue.elements;
  return { events };
};

// const isInitialState = async (id : string): Promise<Boolean> =>
//   (await getState(id)).events.length === 0;

const loadState = async (id : string, state : ContractState, targetUrl: string) => {
  // if (!(await isInitialState(id))) {
  //   throw Error(`Contract with id ${id} is not in an initial state`);
  // }
  const events = state.events;
  const clientTarget = new DeonNodeRestClient(targetUrl);
  for (const e of events) {
    const record = e as RecordValue;
    const response = await clientTarget.contracts.applyEvent(id, { record });
    if (!response.ok) {
      throw Error(`Error when applying event:\n${JSON.stringify(e, null, 2)}\n` +
                 `Response was:\n${util.inspect(response)}`);
    }
  }
};

const migrate = (eventTransformation: (v : Value) => Value) =>
  async (id1 : string, id2 : string, options: { csl: string }) => {
    const targetState = {
      events: (await getState(id1, options.csl)).events.map(eventTransformation),
    };
    const newUrl = process.env.FT_SERVICE_TARGET || url;
    await loadState(id2, targetState, newUrl);
  };

export const migrateCmd = migrate((v : Value) => v);

const addEmptyKeyLocation = (value : Value): Value => {
  const acceptCarShareName = qual('AcceptCarShare');
  if (value.class === 'RecordValue' && QualifiedName.equals(value.recordTag, acceptCarShareName)) {
    value.fields.keyLocation = value.fields.keyLocation ||  mkStringValue('');
  }
  return value;
};

export const migrateAddEmptyKeyLocationCmd = migrate(addEmptyKeyLocation);
