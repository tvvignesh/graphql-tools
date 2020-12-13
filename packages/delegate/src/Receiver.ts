import { AsyncExecutionResult, ExecutionPatchResult, mapAsyncIterator, mergeDeep } from '@graphql-tools/utils';
import { ExecutionResult } from 'graphql';
import { PubSub } from 'graphql-subscriptions';

const PATCH_TOPIC = 'PATCH';

function updateObjectWithPatch(object: any, path: ReadonlyArray<string | number>, patch: Record<string, any>) {
  const pathSegment = path[0];
  if (path.length === 1) {
    mergeDeep(object[pathSegment], patch);
  } else {
    updateObjectWithPatch(object[pathSegment], path.slice(1), patch);
  }
}

function getDataAtPath(object: any, path: ReadonlyArray<string | number>): any {
  const pathSegment = path[0];
  const data = object[pathSegment];
  if (path.length === 1 || data == null) {
    return data;
  } else {
    getDataAtPath(data, path.slice(1));
  }
}

export class Receiver {
  private readonly asyncIterable: AsyncIterable<AsyncExecutionResult>;
  private readonly resultTransformer: (originalResult: ExecutionResult) => any;
  private readonly pubsub: PubSub;
  private result: any;

  constructor(
    asyncIterable: AsyncIterable<AsyncExecutionResult>,
    resultTransformer: (originalResult: ExecutionResult) => any
  ) {
    this.asyncIterable = asyncIterable;
    this.resultTransformer = resultTransformer;
    this.pubsub = new PubSub();
  }

  public async getInitialResult() {
    const asyncIterator = this.asyncIterable[Symbol.asyncIterator]();
    const payload = await asyncIterator.next();
    const transformedResult = this.resultTransformer(payload.value);
    this.result = transformedResult;
    setTimeout(() => this.iterate(), 0);
    return transformedResult;
  }

  private async iterate() {
    for await (const asyncResult of this.asyncIterable) {
      if (isPatchResultWithData(asyncResult)) {
        const transformedResult = this.resultTransformer(asyncResult);
        updateObjectWithPatch(this.result, asyncResult.path, transformedResult);
        this.pubsub.publish(PATCH_TOPIC, asyncResult);
      }
    }
  }

  public async request(requestedPath: Array<string | number>) {
    const data = getDataAtPath(this.result, requestedPath);
    if (data !== undefined) {
      return data;
    }
    const asyncIterator = this.pubsub.asyncIterator<ExecutionPatchResult>(PATCH_TOPIC);
    const asyncIterable = mapAsyncIterator(asyncIterator, value => value);
    for await (const patchResult of asyncIterable) {
      const receivedPath = patchResult.path;
      const receivedPathLength = receivedPath.length;
      if (receivedPathLength <= requestedPath.length) {
        let match = true;
        for (let i = 0; i < receivedPathLength; i++) {
          if (receivedPath[i] !== requestedPath[i]) {
            match = false;
            break;
          }
        }
        if (match) {
          return getDataAtPath(patchResult.data, requestedPath.slice(receivedPathLength));
        }
      }
    }
  }
}

function isPatchResultWithData(result: AsyncExecutionResult): result is ExecutionPatchResult {
  return (result as ExecutionPatchResult).path != null;
}
