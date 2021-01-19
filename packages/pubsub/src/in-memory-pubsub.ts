// adapted from https://github.com/repeaterjs/repeater/blob/7b294acfa7e2c21721ff77018cf77c452c51dad9/packages/pubsub/src/pubsub.ts
// adapted rather than importing @repeaterjs/pubsub
// because of https://github.com/repeaterjs/repeater/issues/67 in which pubsub will be killed!

import { Repeater, RepeaterBuffer } from '@repeaterjs/repeater';
import { InMemoryChannel } from './in-memory-channel';

import { PubSub } from './types';

export class InMemoryPubSub<T> implements PubSub<T> {
  protected channels: Record<string, InMemoryChannel<T>> = Object.create(null);

  publish(topic: string, value: T): void {
    let channel = this.channels[topic];

    if (channel == null) {
      channel = this.channels[topic] = new InMemoryChannel();
    }

    channel.publish(value);
  }

  unpublish(topic: string, reason?: any): void {
    const channel = this.channels[topic];

    if (channel == null) {
      return;
    }

    channel.unpublish(reason);

    delete this.channels[topic];
  }

  subscribe(topic: string, buffer?: RepeaterBuffer): Repeater<T> {
    let channel = this.channels[topic];

    if (this.channels[topic] == null) {
      channel = this.channels[topic] = new InMemoryChannel();
    }

    return channel.subscribe(buffer);
  }

  close(reason?: any): void {
    for (const channel of Object.values(this.channels)) {
      channel.unpublish(reason);
    }

    this.channels = Object.create(null);
  }
}
