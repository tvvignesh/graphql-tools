import { ExecutionResult } from 'graphql';

import { AsyncExecutionResult, ExecutionPatchResult, mergeDeep } from '@graphql-tools/utils';

import { InMemoryChannel } from '@graphql-tools/pubsub';

export class Receiver {
  private readonly asyncIterable: AsyncIterable<AsyncExecutionResult>;
  private readonly resultTransformer: (originalResult: ExecutionResult) => any;
  private readonly initialResultDepth: number;
  private readonly channel: InMemoryChannel<ExecutionPatchResult>;
  private result: any;
  private iterating: boolean;
  private numRequests: number;

  constructor(
    asyncIterable: AsyncIterable<AsyncExecutionResult>,
    resultTransformer: (originalResult: ExecutionResult) => any,
    initialResultDepth: number
  ) {
    this.asyncIterable = asyncIterable;
    this.resultTransformer = resultTransformer;
    this.initialResultDepth = initialResultDepth;
    this.channel = new InMemoryChannel();
    this.iterating = false;
    this.numRequests = 0;
  }

  public async getInitialResult() {
    const asyncIterator = this.asyncIterable[Symbol.asyncIterator]();
    const payload = await asyncIterator.next();
    const transformedResult = this.resultTransformer(payload.value);
    this.result = transformedResult;
    return transformedResult;
  }

  public async request(requestedPath: Array<string | number>): Promise<any> {
    const data = getDataAtPath(this.result, requestedPath.slice(this.initialResultDepth));
    if (data !== undefined) {
      return data;
    }

    const asyncIterable = this._subscribe();

    this.numRequests++;
    if (!this.iterating) {
      setImmediate(() => this._iterate());
    }

    return this._reduce(asyncIterable, requestedPath);
  }

  private _publish(asyncResult: ExecutionPatchResult): void {
    return this.channel.publish(asyncResult);
  }

  private _subscribe(): AsyncIterableIterator<ExecutionPatchResult> {
    return this.channel.subscribe();
  }

  private async _iterate(): Promise<void> {
    const iterator = this.asyncIterable[Symbol.asyncIterator]();

    let hasNext = true;
    while (hasNext && this.numRequests) {
      const payload = await iterator.next();

      hasNext = !payload.done;
      const asyncResult = payload.value;

      if (asyncResult != null && isPatchResultWithData(asyncResult)) {
        const transformedResult = this.resultTransformer(asyncResult);
        updateObjectWithPatch(this.result, asyncResult.path, transformedResult);
        this._publish(asyncResult);
      }
    }
  }

  private async _reduce(
    asyncIterable: AsyncIterableIterator<ExecutionPatchResult>,
    requestedPath: Array<string | number>
  ): Promise<any> {
    for await (const patchResult of asyncIterable) {
      const receivedPath = patchResult.path;
      const receivedPathLength = receivedPath.length;

      if (receivedPathLength > requestedPath.length) {
        continue;
      }

      if (receivedPath.every((value, index) => value === requestedPath[index])) {
        this.numRequests--;
        return getDataAtPath(patchResult.data, requestedPath.slice(receivedPathLength));
      }
    }
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

function isPatchResultWithData(result: AsyncExecutionResult): result is ExecutionPatchResult {
  return (result as ExecutionPatchResult).path != null;
}

function updateObjectWithPatch(object: any, path: ReadonlyArray<string | number>, patch: Record<string, any>) {
  const pathSegment = path[0];
  if (path.length === 1) {
    mergeDeep(object[pathSegment], patch);
  } else {
    updateObjectWithPatch(object[pathSegment], path.slice(1), patch);
  }
}
