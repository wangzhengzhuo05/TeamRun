export class ApiProblem extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ApiProblem'
  }
}
