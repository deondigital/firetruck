import {
  Contract,
  DeonRestClient,
  ListValue,
  RecordValue,
  ResidualSource,
  Value,
  valueToJson,
  QualifiedName,
  Declaration,
  mkContractIdValue,
} from '@deondigital/api-client';
import { renderValue } from './pretty-print';

type ContractState = {
  events: Value[],
};

export class Requests {
  constructor(private client: DeonRestClient) {}

  contracts = (): Promise<Contract[]> => this.client.contracts.getAll();

  contract = (id: string): Promise<Contract> => this.client.contracts.get(id);

  contractIds = async (): Promise<string[]> =>
    (await this.contracts()).map(c => c.id)

  report = (id: string | null) => (reportSrc: string, valueArgs: Value[]): Promise<Value> =>
    id == null
      ? this.client.contracts.report({ csl: reportSrc, values: valueArgs })
      : this.client.contracts.reportOnContract(id, { csl: reportSrc, values: valueArgs })

  reportRendered = (id: string | null) => async (reportSrc : string, valueArgs: Value[]):
    Promise<string> =>
    renderValue(await this.report(id)(reportSrc, valueArgs))

  numberOfEvents = (id: string): Promise<number> =>
    this.report(id)('\\cid -> List::length (getEvents cid)', [mkContractIdValue(id, 'self')])
    .then(v => valueToJson(v) as number)

  mapReport = (
    contractIdsAndValueArgs: [string, Value[]][],
    reportSrc: string,
  ): Promise<{ id: string, value: Value | null }[]> =>
    Promise.all(contractIdsAndValueArgs.map(async ([id, valueArgs]) => {
      const value = await this.reportMaybe(id, reportSrc, valueArgs);
      return { id, value };
    }))

  reportMaybe = (id: string, reportSrc: string, valueArgs: Value[]): Promise<Value | null> =>
    this.client.contracts.reportOnContract(id,
                                           { csl: reportSrc, values: valueArgs }).catch(() => null)

  sortByReport = async (
    contractIdsAndValueArgs: [string, Value[]][],
    reportSrc: string,
    valueComparer: (a: Value | null, b: Value | null) => number,
  ): Promise<{ id: string, value: Value | null}[]> => {
    const idsWithValues = await this.mapReport(contractIdsAndValueArgs, reportSrc);
    idsWithValues.sort((a, b) => valueComparer(a.value, b.value));
    return idsWithValues;
  }

  instantiate = async (
    declarationId: string,
    name: string,
    declarationExpressionArguments: Value[],
    entryPoint: QualifiedName,
    peers: string[],
  ): Promise<{ contractId: string }> =>
    this.client.contracts.instantiate({
      declarationExpressionArguments,
      declarationId,
      entryPoint,
      name,
      peers,
    })

  getDeclaration = (declarationId: string): Promise<Declaration> =>
    this.client.declarations.get(declarationId)

  residual = (id : string, simplified : boolean): Promise<ResidualSource> =>
    this.client.contracts.src(id, simplified)

  getState = async (id : string): Promise<ContractState> => {
    const eventsCsl = '\\cid -> getEvents cid';
    const eventsValue = await this.report(id)(
      eventsCsl,
      [mkContractIdValue(id, 'self')]) as ListValue;
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
