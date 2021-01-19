import { RepeaterBuffer } from '@repeaterjs/repeater';

export interface Channel<T> {
  publish(value: T): Promise<unknown> | unknown;
  unpublish(reason?: any): Promise<unknown> | unknown;
  subscribe(buffer?: RepeaterBuffer): AsyncIterableIterator<T>;
}

export interface PubSub<T> {
  publish(topic: string, value: T): Promise<unknown> | unknown;
  unpublish(topic: string, reason?: any): Promise<unknown> | unknown;
  subscribe(topic: string, buffer?: RepeaterBuffer): AsyncIterableIterator<T>;
  close(reason?: any): Promise<unknown> | unknown;
}
