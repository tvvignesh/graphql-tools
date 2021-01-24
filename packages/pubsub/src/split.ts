// adapted from: https://stackoverflow.com/questions/63543455/how-to-multicast-an-async-iterable
// and: https://gist.github.com/jed/cc1e949419d42e2cb26d7f2e1645864d
// and also: https://github.com/repeaterjs/repeater/issues/48#issuecomment-569134039

import { Push, Repeater } from '@repeaterjs/repeater';

import { Splitter } from './types';

export function split<T>(asyncIterable: AsyncIterableIterator<T>, n: number, splitter: Splitter<IteratorResult<T>>) {
  const iterator = asyncIterable[Symbol.asyncIterator]();
  const returner = iterator.return ?? undefined;

  const buffers: Array<Array<IteratorResult<T>>> = Array(n).fill([]);

  if (returner) {
    const set: Set<number> = new Set();
    return buffers.map((buffer, index) => {
      set.add(index);
      return new Repeater(async (push, stop) => {
        let earlyReturn: any;
        stop.then(() => {
          set.delete(index);
          if (!set.size) {
            earlyReturn = returner();
          }
        });

        await loop(push, earlyReturn, buffer, index, buffers, iterator, splitter);

        await earlyReturn;
      });
    });
  }

  return buffers.map(
    (buffer, index) =>
      new Repeater(async (push, stop) => {
        let earlyReturn: any;
        stop.then(() => {
          earlyReturn = returner ? returner() : true;
        });

        await loop(push, earlyReturn, buffer, index, buffers, iterator, splitter);

        await earlyReturn;
      })
  );
}

async function loop<T>(
  push: Push<T>,
  earlyReturn: Promise<any> | any,
  buffer: Array<IteratorResult<T>>,
  index: number,
  buffers: Array<Array<IteratorResult<T>>>,
  iterator: AsyncIterator<T>,
  splitter: Splitter<IteratorResult<T>>
): Promise<void> {
  /* eslint-disable no-unmodified-loop-condition */
  while (!earlyReturn) {
    const iteration = await next(buffer, index, buffers, iterator, splitter);

    if (iteration === undefined) {
      continue;
    }

    if (iteration.done) {
      stop();
      return iteration.value;
    }

    await push(iteration.value);
  }
  /* eslint-enable no-unmodified-loop-condition */
}

async function next<T>(
  buffer: Array<IteratorResult<T>>,
  index: number,
  buffers: Array<Array<IteratorResult<T>>>,
  iterator: AsyncIterator<T>,
  splitter: Splitter<IteratorResult<T>>
): Promise<IteratorResult<T> | undefined> {
  let iteration: IteratorResult<T>;

  if (0 in buffer) {
    return buffer.shift();
  }

  const iterationCandidate = await iterator.next();

  const value = iterationCandidate.value;
  if (value) {
    const [iterationIndex, newValue] = splitter(value);
    if (index === iterationIndex) {
      return newValue;
    }

    buffers[iterationIndex].push(iteration);
    return undefined;
  }

  for (const buffer of buffers) {
    buffer.push(iteration);
  }
  return iterationCandidate;
}
