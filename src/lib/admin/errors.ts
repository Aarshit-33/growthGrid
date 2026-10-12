import type { FieldIssue } from "./types";

/** A problem to show in the admin as is. */
export class AdminError extends Error {
  constructor(
    message: string,
    readonly details: { errors?: string[]; conflict?: boolean; issues?: FieldIssue[] } = {},
  ) {
    super(message);
    this.name = "AdminError";
  }
}
