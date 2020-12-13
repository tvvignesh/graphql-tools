import { ExecutionResult, AsyncExecutionResult } from '@graphql-tools/utils';

import { Receiver } from './Receiver';

import { PATH_PREFIX_SYMBOL, RECEIVER_SYMBOL } from './symbols';
import { IncrementalResult } from './types';

export async function asyncIterableToIncrementalResult(
  asyncIterable: AsyncIterable<AsyncExecutionResult<Record<string, any>>>,
  resultTransformer: (originalResult: ExecutionResult) => any,
  pathPrefix: number
): Promise<IncrementalResult> {
  const receiver = new Receiver(asyncIterable, resultTransformer);

  const initialResult = await receiver.getInitialResult();

  initialResult[RECEIVER_SYMBOL] = receiver;
  initialResult[PATH_PREFIX_SYMBOL] = pathPrefix;

  return initialResult;
}

export function isIncrementalResult(result: any): result is IncrementalResult {
  return (result as IncrementalResult)[RECEIVER_SYMBOL] != null;
}
