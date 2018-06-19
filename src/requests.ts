import {
  Contract,
  DeonRestClient,
  ListValue,
  RecordValue,
  ResidualSource,
  Value,
  valueToJson,
} from 'deon-api-client';
import util from 'util';
import { renderValue } from './pretty-print';

type ContractState = {
  events: Value[],
};

export class Requests {
  private client: DeonRestClient;

  constructor(client: DeonRestClient) {
    this.client = client;
  }

  contracts = async (): Promise<Contract[]> => {
    const response = await this.client.contracts.getAll();
    if (response.ok && response.data) {
      return response.data;
    }
    throw Error(`Bad response from server.\n${util.inspect(response)}}`);
  }

  contract = async (id: string): Promise<Contract> => {
    const r = await this.client.contracts.get(id);
    if (r.ok && r.data) {
      return r.data;
    }
    throw Error(`Could not find contract with id: ${id}`);
  }

  contractIds = async (): Promise<string[]> =>
    (await this.contracts()).map(c => c.id)

  report = (id: string | null) => async (reportSrc: string): Promise<Value> => {
    const response = id == null
      ? await this.client.contracts.report({ csl: reportSrc })
      : await this.client.contracts.reportOnContract(id, { csl: reportSrc });
    if (response.ok && response.data) {
      return response.data;
    }
    if (response.statusCode === 404) {
      throw Error(`Could not find contract with id: ${id}`);
    }
    throw Error(`Could not evaluate report ${reportSrc} on contract with id ${id}. `
                + `Response was:\n${util.inspect(response)}`);
  }

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
      const response = await this.client.contracts.reportOnContract(id, { csl: reportSrc });
      const value = response.ok ? response.data as Value : null;
      return { id, value };
    }))

  sortByReport = async (
    contractIds: string[],
    reportSrc: string,
    valueComparer: (a: Value | null, b: Value | null) => number,
  ): Promise<{ id: string, value: Value | null}[]> => {
    const idsWithValues = await this.mapReport(contractIds, reportSrc);
    idsWithValues.sort((a, b) => valueComparer(a.value, b.value));
    return idsWithValues;
  }

  residual = async (id : string, simplified : boolean): Promise<ResidualSource> => {
    const r = await this.client.contracts.src(id, simplified);
    if (r.ok && r.data) {
      return r.data;
    } if (r.statusCode === 404) {
      throw Error(`Could not find contract with id: ${id}`);
    }
    throw Error(`Could not retrieve simplified contract for contract with id: ${id}`);
  }

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
      const response = await this.client.contracts.applyEvent(id, { record });
      if (!response.ok) {
        throw Error(`Error when applying event:\n${JSON.stringify(e, null, 2)}\n` +
                    `Response was:\n${util.inspect(response)}`);
      }
    }
  }
}
