import { ExecutionPatchResult, ExecutionResult, GraphQLResolveInfo, GraphQLSchema, responsePathAsArray } from 'graphql';

import { AsyncExecutionResult } from '@graphql-tools/utils';
import { InMemoryPubSub } from '@graphql-tools/pubsub';

import { DelegationContext, ExternalObject, SubschemaConfig } from './types';
import { getUnpathedErrors } from './externalObjects';
import { resolveExternalValue } from './resolveExternalValue';

export class Receiver {
  private readonly asyncIterable: AsyncIterable<AsyncExecutionResult>;
  private readonly fieldName: string;
  private readonly subschema: GraphQLSchema | SubschemaConfig;
  private readonly context: Record<string, any>;
  private readonly resultTransformer: (originalResult: ExecutionResult) => any;
  private readonly initialResultDepth: number;
  private readonly pubsub: InMemoryPubSub<ExternalObject>;
  private parents: Record<string, Array<ExternalObject>>;
  private iterating: boolean;
  private numRequests: number;

  constructor(
    asyncIterable: AsyncIterable<AsyncExecutionResult>,
    delegationContext: DelegationContext,
    resultTransformer: (originalResult: ExecutionResult) => any
  ) {
    this.asyncIterable = asyncIterable;

    const { fieldName, subschema, context, info } = delegationContext;

    this.fieldName = fieldName;
    this.subschema = subschema;
    this.context = context;

    this.resultTransformer = resultTransformer;
    this.initialResultDepth = info ? responsePathAsArray(info.path).length - 1 : 0;
    this.parents = Object.create(null);
    this.pubsub = new InMemoryPubSub();

    this.iterating = false;
    this.numRequests = 0;
  }

  public async getInitialResult() {
    const asyncIterator = this.asyncIterable[Symbol.asyncIterator]();
    const payload = await asyncIterator.next();
    const transformedResult = this.resultTransformer(payload.value);
    return transformedResult;
  }

  public async request(info: GraphQLResolveInfo): Promise<any> {
    const pathArray = responsePathAsArray(info.path).slice(this.initialResultDepth);
    const responseKey = pathArray.pop() as string;
    const path = pathArray.join('.');

    const parents = this.parents[path];
    if (parents !== undefined) {
      for (const parent of parents) {
        const data = parent[responseKey];
        if (data !== undefined) {
          const unpathedErrors = getUnpathedErrors(parent);
          return resolveExternalValue(data, unpathedErrors, this.subschema, this.context, info, this);
        }
      }
    }

    const asyncIterable = this.pubsub.subscribe(path);

    this.numRequests++;
    if (!this.iterating) {
      this._iterate();
    }

    return this._reduce(asyncIterable, responseKey, info);
  }

  private async _reduce(
    asyncIterable: AsyncIterableIterator<ExternalObject>,
    responseKey: string,
    info: GraphQLResolveInfo
  ): Promise<any> {
    for await (const parent of asyncIterable) {
      const data = parent[responseKey];
      if (data !== undefined) {
        const unpathedErrors = getUnpathedErrors(parent);
        return resolveExternalValue(data, unpathedErrors, this.subschema, this.context, info, this);
      }
    }
  }

  private async _iterate(): Promise<void> {
    const iterator = this.asyncIterable[Symbol.asyncIterator]();

    let hasNext = true;
    while (hasNext && this.numRequests) {
      const payload = (await iterator.next()) as IteratorResult<ExecutionPatchResult, ExecutionPatchResult>;

      hasNext = !payload.done;
      const asyncResult = payload.value;

      if (asyncResult != null && asyncResult.path?.[0] === this.fieldName) {
        const transformedResult = this.resultTransformer(asyncResult);
        this.pubsub.publish(asyncResult.path.join('.'), transformedResult);
      }
    }
  }
}
