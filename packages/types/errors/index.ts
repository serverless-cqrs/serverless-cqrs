type ConcurrencyErrorName = "ConcurrencyError";

export class ConcurrencyError extends Error {
  name: ConcurrencyErrorName;
  message: string;
  cause: any;

  constructor({
    name,
    message,
    cause,
  }: {
    name: ConcurrencyErrorName;
    message: string;
    cause?: any;
  }) {
    super();
    this.name = name;
    this.message = message;
    this.cause = cause;
  }
}

