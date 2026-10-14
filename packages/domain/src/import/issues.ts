import type { DataIssue, Severity, SourceFile } from '../types.ts';

/** Collects data quality findings; every repair or exclusion done by the import ends up here. */
export class IssueLog {
  readonly issues: DataIssue[] = [];

  for(file: SourceFile) {
    return (ref: string, type: string, severity: Severity, message: string) => {
      this.issues.push({ file, ref, type, severity, message });
    };
  }
}

export type AddIssue = ReturnType<IssueLog['for']>;
