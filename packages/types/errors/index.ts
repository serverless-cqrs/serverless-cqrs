type PeristanceErrorName = "versionExists";

export class RepositoryError extends Error {
  name: PeristanceErrorName;
  message: string;
  cause: any;

  constructor({
    name,
    message,
    cause,
  }: {
    name: PeristanceErrorName;
    message: string;
    cause?: any;
  }) {
    super();
    this.name = name;
    this.message = message;
    this.cause = cause;
  }
}
