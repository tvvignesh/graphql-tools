import { AsyncExecutionResult, ExecutionPatchResult, mapAsyncIterator } from '@graphql-tools/utils';
import { ExecutionResult } from 'graphql';
import { PubSub } from 'graphql-subscriptions';

const PATCH_TOPIC = 'PATCH';

function updateObjectWithPatch(object: any, path: ReadonlyArray<string | number>, patch: ExecutionPatchResult) {
  const pathSegment = path[0];
  if (path.length === 1) {
    object[pathSegment] = patch;
  } else {
    updateObjectWithPatch(object[pathSegment], path.slice(1), patch);
  }
}

function getDataAtPath(object: any, path: ReadonlyArray<string | number>): any {
  const pathSegment = path[0];
  const data = object[pathSegment];
  if (path.length === 1) {
    return data;
  } else {
    getDataAtPath(data, path.slice(1));
  }
}

export class Receiver {
  private readonly asyncIterable: AsyncIterable<AsyncExecutionResult>;
  private readonly pubsub: PubSub;
  private result: ExecutionResult;

  constructor(asyncIterable: AsyncIterable<AsyncExecutionResult>, initialResult: ExecutionResult) {
    this.asyncIterable = asyncIterable;
    this.pubsub = new PubSub();
    this.result = {
      ...initialResult,
    };
    setTimeout(() => this.iterate(), 0);
  }

  private async iterate() {
    for await (const asyncResult of this.asyncIterable) {
      if (isPatchResultWithData(asyncResult)) {
        updateObjectWithPatch(this.result.data, asyncResult.path, asyncResult);
        this.pubsub.publish(PATCH_TOPIC, asyncResult);
      }
    }
  }

  public async request(requestedPath: Array<string | number>) {
    const data = getDataAtPath(this.result.data, requestedPath);
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
