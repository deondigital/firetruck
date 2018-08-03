import {
  Contract,
  DeonRestClient,
  ListValue,
  RecordValue,
  ResidualSource,
  Value,
  valueToJson,
} from '@deondigital/api-client';
import { renderValue } from './pretty-print';

type ContractState = {
  events: Value[],
};

export class Requests {
  private client: DeonRestClient;

  constructor(client: DeonRestClient) {
    this.client = client;
  }

  contracts = (): Promise<Contract[]> => this.client.contracts.getAll();

  contract = (id: string): Promise<Contract> => this.client.contracts.get(id);

  contractIds = async (): Promise<string[]> =>
    (await this.contracts()).map(c => c.id)

  report = (id: string | null) => (reportSrc: string): Promise<Value> => id == null
    ? this.client.contracts.report({ csl: reportSrc })
    : this.client.contracts.reportOnContract(id, { csl: reportSrc })

  reportRendered = (id: string | null) => async (reportSrc : string): Promise<string> =>
    renderValue(await this.report(id)(reportSrc))

  numberOfEvents = (id: string): Promise<number> =>
    this.report(id)('List::length events')
    .then(v => valueToJson(v) as number)

  mapReport = (
    contractIds: string[],
    reportSrc: string,
  ): Promise<{ id: string, value: Value | null }[]> =>
    Promise.all(contractIds.map(async (id) => {
      const value = await this.reportMaybe(id, reportSrc);
      return { id, value };
    }))

  reportMaybe = (id: string, reportSrc: string): Promise<Value | null> =>
    this.client.contracts.reportOnContract(id, { csl: reportSrc }).catch(() => null)

  sortByReport = async (
    contractIds: string[],
    reportSrc: string,
    valueComparer: (a: Value | null, b: Value | null) => number,
  ): Promise<{ id: string, value: Value | null}[]> => {
    const idsWithValues = await this.mapReport(contractIds, reportSrc);
    idsWithValues.sort((a, b) => valueComparer(a.value, b.value));
    return idsWithValues;
  }

  residual = (id : string, simplified : boolean): Promise<ResidualSource> =>
    this.client.contracts.src(id, simplified)

  getState = async (id : string, eventsCsl : string = 'events'): Promise<ContractState> => {
    const eventsValue = await this.report(id)(eventsCsl) as ListValue;
    const events = eventsValue.elements;
    return { events };
  }

  loadState = async (id : string, state : ContractState) => {
    if (await this.numberOfEvents(id) > 0) {
      throw Error(`Contract with id ${id} is not in an initial state`);
    }
    for (const e of state.events) {
      const record = e as RecordValue;
      await this.client.contracts.applyEvent(id, { record });
    }
  }
}
