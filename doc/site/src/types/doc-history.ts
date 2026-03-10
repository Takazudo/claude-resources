/** A single git revision entry for a document */
export interface DocHistoryEntry {
  /** Full commit hash (use .slice(0, 7) for display) */
  hash: string;
  /** ISO 8601 date string */
  date: string;
  /** Commit author name */
  author: string;
  /** First line of commit message */
  message: string;
  /** Full file content at this revision */
  content: string;
}

/** Complete history data for a single document */
export interface DocHistoryData {
  /** Document slug (route path) */
  slug: string;
  /** Relative file path in the repository */
  filePath: string;
  /** Git revision entries, newest first */
  entries: DocHistoryEntry[];
}
