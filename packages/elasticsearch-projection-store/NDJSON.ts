export const stringify = (array: any[]): string => {
  return array.reduce((p, c) => p + JSON.stringify(c) + "\n", "");
};
