import { ExecutionResult, AsyncExecutionResult } from '@graphql-tools/utils';

import { Receiver } from './Receiver';

import { RECEIVER_SYMBOL } from './symbols';
import { IncrementalResult } from './types';

export async function asyncIterableToIncrementalResult(
  asyncIterable: AsyncIterable<AsyncExecutionResult<Record<string, any>>>
): Promise<IncrementalResult & ExecutionResult> {
  const asyncIterator = asyncIterable[Symbol.asyncIterator]();
  const payload = await asyncIterator.next();
  const result = payload.value;

  result[RECEIVER_SYMBOL] = new Receiver(asyncIterable, result);

  return result;
}

export function isIncrementalResult(result: any): result is IncrementalResult {
  return (result as IncrementalResult)[RECEIVER_SYMBOL] != null;
}
