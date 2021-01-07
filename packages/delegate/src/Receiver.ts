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
  private readonly initialResultDepth: number;
  private readonly pubsub: PubSub;
  private result: any;
  private iterating: boolean;

  constructor(
    asyncIterable: AsyncIterable<AsyncExecutionResult>,
    resultTransformer: (originalResult: ExecutionResult) => any,
    initialResultDepth: number
  ) {
    this.asyncIterable = asyncIterable;
    this.resultTransformer = resultTransformer;
    this.initialResultDepth = initialResultDepth;
    this.pubsub = new PubSub();
    this.iterating = false;
  }

  public async getInitialResult() {
    const asyncIterator = this.asyncIterable[Symbol.asyncIterator]();
    const payload = await asyncIterator.next();
    const transformedResult = this.resultTransformer(payload.value);
    this.result = transformedResult;
    return transformedResult;
  }

  private async iterate() {
    for await (const asyncResult of this.asyncIterable) {
      if (isPatchResultWithData(asyncResult)) {
        const transformedResult = this.resultTransformer(asyncResult);
        updateObjectWithPatch(this.result, asyncResult.path, transformedResult);
        this._publish(asyncResult);
      }
    }
  }

  private _publish(patchResult: ExecutionPatchResult<Record<string, any>>): void {
    this.pubsub.publish(PATCH_TOPIC, patchResult);
  }

  private _subscribe(): AsyncIterableIterator<ExecutionPatchResult<Record<string, any>>> {
    const asyncIterator = this.pubsub.asyncIterator<ExecutionPatchResult>(PATCH_TOPIC);
    return mapAsyncIterator(asyncIterator, value => value);
  }

  public async request(requestedPath: Array<string | number>) {
    const data = getDataAtPath(this.result, requestedPath.slice(this.initialResultDepth));
    if (data !== undefined) {
      return data;
    }

    const asyncIterable = this._subscribe();

    if (!this.iterating) {
      setTimeout(() => this.iterate(), 0);
    }

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
