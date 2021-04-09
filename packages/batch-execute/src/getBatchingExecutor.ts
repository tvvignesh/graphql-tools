import DataLoader from 'dataloader';

import { ExecutionParams, Executor } from '@graphql-tools/utils';
import { createBatchingExecutor } from './createBatchingExecutor';
import { memoize2of4 } from './memoize';

export const getBatchingExecutor = memoize2of4(function (
  _context: Record<string, any> = self ?? window ?? global,
  executor: Executor,
  dataLoaderOptions?: DataLoader.Options<any, any, any>,
  extensionsReducer?: (mergedExtensions: Record<string, any>, executionParams: ExecutionParams) => Record<string, any>
): Executor {
  return createBatchingExecutor(executor, dataLoaderOptions, extensionsReducer);
});
