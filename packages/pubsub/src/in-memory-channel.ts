// adapted from https://github.com/repeaterjs/repeater/blob/7b294acfa7e2c21721ff77018cf77c452c51dad9/packages/pubsub/src/pubsub.ts
// adapted rather than importing @repeaterjs/pubsub
// because of https://github.com/repeaterjs/repeater/issues/67 in which pubsub will be killed!

import { Repeater, RepeaterBuffer } from '@repeaterjs/repeater';

import { Channel } from './types';

interface Hooks<T> {
  push(value: T): Promise<unknown>;
  stop(reason?: any): unknown;
}

export class InMemoryChannel<T> implements Channel<T> {
  protected hooks: Set<Hooks<T>> = new Set();

  publish(value: T): void {
    const hooks = this.hooks;

    for (const { push, stop } of hooks) {
      try {
        push(value).catch(stop);
      } catch (err) {
        // push queue is full
        stop(err);
      }
    }
  }

  unpublish(reason?: any): void {
    const hooks = this.hooks;

    for (const { stop } of hooks) {
      stop(reason);
    }

    hooks.clear();
  }

  subscribe(buffer?: RepeaterBuffer): Repeater<T> {
    return new Repeater<T>(async (push, stop) => {
      const publisher = { push, stop };
      this.hooks.add(publisher);
      await stop;
      this.hooks.delete(publisher);
    }, buffer);
  }
}
