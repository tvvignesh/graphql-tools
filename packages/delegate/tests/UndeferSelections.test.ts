import { parse, print } from 'graphql';

import { DelegationContext } from '../src';

import UndeferSelections from '../src/transforms/UndeferSelections';

describe('undefer directive', () => {
  test('should work on fields', async () => {
    const transform = new UndeferSelections();

    const request = {
      document: parse(`
        fragment Test on Type {
          ...Fragment @defer
        }

        fragment Fragment on Type {
          field1
          field2 @undefer
        }
      `, { noLocation: true }),
      variables: {},
    };

    const transformedRequest = transform.transformRequest(request, {} as DelegationContext, {});

    expect(print(transformedRequest.document)).toEqual(print(parse(`
      fragment Test on Type {
        ...__Deferred__Fragment @defer
        ...__Undeferred__Fragment
      }

      fragment Fragment on Type {
        field1
        field2
      }

      fragment __Deferred__Fragment on Type {
        field1
      }

      fragment __Undeferred__Fragment on Type {
        field2
      }
    `, { noLocation: true })));
  });

  test('should work on fields with inline deferred fragments', async () => {
    const transform = new UndeferSelections();

    const request = {
      document: parse(`
        fragment Test on Type {
          ... on Type @defer {
            field1
            field2 @undefer
          }
        }
      `, { noLocation: true }),
      variables: {},
    };

    const transformedRequest = transform.transformRequest(request, {} as DelegationContext, {});

    expect(print(transformedRequest.document)).toEqual(print(parse(`
      fragment Test on Type {
        ... on Type @defer {
          field1
        }
        ... on Type {
          field2
        }
      }
    `, { noLocation: true })));
  });

  test('should work on inline fragment spreads', async () => {
    const transform = new UndeferSelections();

    const request = {
      document: parse(`
        fragment Test on Type {
          ...Fragment @defer
        }

        fragment Fragment on Type {
          field1
          ... on Type @undefer {
            field2
          }
        }
      `, { noLocation: true }),
      variables: {},
    };

    const transformedRequest = transform.transformRequest(request, {} as DelegationContext, {});

    expect(print(transformedRequest.document)).toEqual(print(parse(`
      fragment Test on Type {
        ...__Deferred__Fragment @defer
        ...__Undeferred__Fragment
      }

      fragment Fragment on Type {
        field1
        ... on Type {
          field2
        }
      }

      fragment __Deferred__Fragment on Type {
        field1
      }

      fragment __Undeferred__Fragment on Type {
        ... on Type {
          field2
        }
      }
    `, { noLocation: true })));
  });

  test('should work on fields in nested fragments', async () => {
    const transform = new UndeferSelections();

    const request = {
      document: parse(`
        fragment Test on Type {
          ...Fragment @defer
        }

        fragment Fragment on Type {
          ... on Type {
            field1
            field2 @undefer
          }
        }
      `, { noLocation: true }),
      variables: {},
    };

    const transformedRequest = transform.transformRequest(request, {} as DelegationContext, {});

    expect(print(transformedRequest.document)).toEqual(print(parse(`
      fragment Test on Type {
        ...__Deferred__Fragment @defer
        ...__Undeferred__Fragment
      }

      fragment Fragment on Type {
        ... on Type {
          field1
          field2
        }
      }

      fragment __Deferred__Fragment on Type {
        ... on Type {
          field1
        }
      }

      fragment __Undeferred__Fragment on Type {
        ... on Type {
          field2
        }
      }
    `, { noLocation: true })));
  });

  test('should work on nested fields', async () => {
    const transform = new UndeferSelections();

    const request = {
      document: parse(`
        fragment Test on Type {
          ...Fragment @defer
        }

        fragment Fragment on Type {
          objectA {
            ... on SubType @defer {
              field1
              field2 @undefer
            }
          }
          objectB @undefer {
            field3
          }
        }
      `, { noLocation: true }),
      variables: {},
    };

    const transformedRequest = transform.transformRequest(request, {} as DelegationContext, {});

    expect(print(transformedRequest.document)).toEqual(print(parse(`
      fragment Test on Type {
        ...__Deferred__Fragment @defer
        ...__Undeferred__Fragment
      }

      fragment Fragment on Type {
        objectA {
          ... on SubType @defer {
            field1
          }
          ... on SubType {
            field2
          }
        }
        objectB {
          field3
        }
      }

      fragment __Deferred__Fragment on Type {
        objectA {
          ... on SubType @defer {
            field1
          }
          ... on SubType {
            field2
          }
        }
      }

      fragment __Undeferred__Fragment on Type {
        objectB {
          field3
        }
      }
    `, { noLocation: true })));
  });
});
