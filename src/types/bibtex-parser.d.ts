declare module "@retorquere/bibtex-parser" {
  export interface BibtexCreator {
    firstName?: string;
    lastName?: string;
    name?: string;
  }

  export interface BibtexEntry {
    type: string;
    key: string;
    fields: Record<string, string | BibtexCreator[] | string[]>;
    input?: string;
  }

  export interface BibtexLibrary {
    entries: BibtexEntry[];
    errors: Array<{ error?: string; input?: string }>;
  }

  export function parse(input: string, options?: Record<string, unknown>): BibtexLibrary;
  export function parseAsync(
    input: string,
    options?: Record<string, unknown>,
  ): Promise<BibtexLibrary>;
}
