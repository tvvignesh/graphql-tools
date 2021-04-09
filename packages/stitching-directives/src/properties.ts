import { PropertyTree } from './types';

export function addProperty(object: Record<string, any>, path: Array<string | number>, value: any) {
  const initialSegment = path[0];
  if (path.length === 1) {
    object[initialSegment] = value;
    return;
  }

  let field = object[initialSegment];
  if (field != null) {
    addProperty(field, path.slice(1), value);
    return;
  }

  if (typeof path[1] === 'string') {
    field = Object.create(null);
  } else {
    field = [];
  }
  addProperty(field, path.slice(1), value);
  object[initialSegment] = field;
}

export function getProperty(object: Record<string, any>, path: Array<string>): any {
  if (!path.length || object == null) {
    return object;
  }

  const newPath = path.slice();
  const key = newPath.shift();
  const prop = object[key];

  return getProperty(prop, newPath);
}

export function getProperties(object: Record<string, any>, propertyTree: PropertyTree): any {
  if (object == null) {
    return object;
  }

  const newObject = Object.create(null);

  Object.entries(propertyTree).forEach(([key, subKey]) => {
    if (subKey == null) {
      newObject[key] = object[key];
      return;
    }

    const prop = object[key];

    if (Array.isArray(prop)) {
      newObject[key] = prop.map(item => getProperties(item, subKey));
      return;
    }

    newObject[key] = getProperties(prop, subKey);
  });

  return newObject;
}

export function propertyTreeFromPaths(paths: Array<Array<string>>): PropertyTree {
  const propertyTree = Object.create(null);
  paths.forEach(path => {
    addProperty(propertyTree, path, null);
  });
  return propertyTree;
}
