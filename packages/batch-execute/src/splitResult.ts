// adapted from https://github.com/gatsbyjs/gatsby/blob/master/packages/gatsby-source-graphql/src/batching/merge-queries.js

import { ExecutionResult, GraphQLError } from 'graphql';

import isPromise from 'is-promise';

import { AsyncExecutionResult, isAsyncIterable, relocatedError } from '@graphql-tools/utils';
import { split } from '@graphql-tools/pubsub';

import { parseKey } from './prefix';

export function splitResult(
  mergedResult:
    | ExecutionResult
    | AsyncIterableIterator<AsyncExecutionResult>
    | Promise<ExecutionResult | AsyncIterableIterator<AsyncExecutionResult>>,
  numResults: number
): Array<
  | ExecutionResult
  | AsyncIterableIterator<AsyncExecutionResult>
  | Promise<ExecutionResult | AsyncIterableIterator<AsyncExecutionResult>>
> {
  if (isPromise(mergedResult)) {
    const result = mergedResult.then(r => splitExecutionResultOrAsyncIterableIterator(r, numResults));
    const splitResults: Array<Promise<ExecutionResult | AsyncIterableIterator<ExecutionResult>>> = [];
    for (let i = 0; i < numResults; i++) {
      splitResults.push(result.then(r => r[i]));
    }

    return splitResults;
  }

  return splitExecutionResultOrAsyncIterableIterator(mergedResult, numResults);
}

export function splitExecutionResultOrAsyncIterableIterator(
  mergedResult: ExecutionResult | AsyncIterableIterator<AsyncExecutionResult>,
  numResults: number
): Array<ExecutionResult | AsyncIterableIterator<AsyncExecutionResult>> {
  if (isAsyncIterable(mergedResult)) {
    return split(mergedResult, numResults, originalResult => {
      // TODO: implement splitter instead of this placeholder
      return [0, originalResult];
    });
  }

  return splitExecutionResult(mergedResult, numResults);
}

/**
 * Split and transform result of the query produced by the `merge` function
 */
export function splitExecutionResult(mergedResult: ExecutionResult, numResults: number): Array<ExecutionResult> {
  const splitResults: Array<ExecutionResult> = [];
  for (let i = 0; i < numResults; i++) {
    splitResults.push({});
  }

  const data = mergedResult.data;
  if (data) {
    Object.keys(data).forEach(prefixedKey => {
      const { index, originalKey } = parseKey(prefixedKey);
      if (!splitResults[index].data) {
        splitResults[index].data = { [originalKey]: data[prefixedKey] };
      } else {
        splitResults[index].data[originalKey] = data[prefixedKey];
      }
    });
  }

  const errors = mergedResult.errors;
  if (errors) {
    const newErrors: Record<string, Array<GraphQLError>> = Object.create(null);
    errors.forEach(error => {
      if (error.path) {
        const parsedKey = parseKey(error.path[0] as string);
        if (parsedKey) {
          const { index, originalKey } = parsedKey;
          const newError = relocatedError(error, [originalKey, ...error.path.slice(1)]);
          if (!newErrors[index]) {
            newErrors[index] = [newError];
          } else {
            newErrors[index].push(newError);
          }
          return;
        }
      }

      splitResults.forEach((_splitResult, index) => {
        if (!newErrors[index]) {
          newErrors[index] = [error];
        } else {
          newErrors[index].push(error);
        }
      });
    });

    Object.keys(newErrors).forEach(index => {
      splitResults[index].errors = newErrors[index];
    });
  }

  return splitResults;
}
