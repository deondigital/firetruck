import { Value } from 'deon-api-client';

export const intValueComparer = (a: Value | null, b: Value | null) => {
  if (a == null || a.class !== 'IntValue') {
    if (b == null || b.class !== 'IntValue') {
      return 0;
    }
    return -1;
  }
  if (b == null || b.class !== 'IntValue') {
    return 1;
  }
  return a.i - b.i;
};

export const instantValueComparer = (a: Value | null, b: Value | null) => {
  if (a == null || a.class !== 'InstantValue') {
    if (b == null || b.class !== 'InstantValue') {
      return 0;
    }
    return -1;
  }
  if (b == null || b.class !== 'InstantValue') {
    return 1;
  }
  return a.instant < b.instant ? -1 : (a.instant > b.instant ? 1 : 0);
};
