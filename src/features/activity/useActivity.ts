// State for the Activity screen: the chosen filter and search, the pages loaded so far, and "load more".
// A new filter or search starts again from the newest row; an answer to an older query is ignored.

import { useCallback, useEffect, useState } from "react";

import { supabase, type Db } from "../../lib/supabase";
import { activityQuery, nextCursor, type ActivityFilter, type ActivityRow, type Cursor } from "./query";

const SEARCH_DELAY_MS = 250;

interface Query {
  filter: ActivityFilter;
  search: string;
}

interface Result {
  query: Query;
  rows: ActivityRow[];
  cursor?: Cursor;
  error?: string;
  /** A "load more" for this query is on its way. */
  more?: boolean;
}

export function useActivity(db: () => Db = supabase) {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState<Query>({ filter, search });
  const [result, setResult] = useState<Result>();

  // Typing waits for a pause; a filter tap applies at once.
  useEffect(() => {
    const delay = search === query.search ? 0 : SEARCH_DELAY_MS;
    const t = setTimeout(
      () => setQuery((q) => (q.filter === filter && q.search === search ? q : { filter, search })),
      delay,
    );
    return () => clearTimeout(t);
  }, [filter, search, query.search]);

  const fetchPage = useCallback(
    (from?: Cursor) =>
      activityQuery(db(), { ...query, cursor: from }).then(({ data, error }) =>
        setResult((prev) => merge(prev, query, from, data ?? [], error?.message)),
      ),
    [db, query],
  );

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  const current = result?.query === query ? result : undefined;

  const loadMore = useCallback(() => {
    if (!current?.cursor || current.more) return;
    setResult({ ...current, more: true });
    void fetchPage(current.cursor);
  }, [current, fetchPage]);

  return {
    filter,
    setFilter,
    search,
    setSearch,
    rows: current?.rows ?? [],
    hasMore: !!current?.cursor,
    loadMore,
    loading: !current || !!current.more,
    error: current?.error,
  };
}

function merge(
  prev: Result | undefined,
  query: Query,
  from: Cursor | undefined,
  data: ActivityRow[],
  error?: string,
) {
  const same = prev?.query === query ? prev : undefined;
  if (from && !same) return prev; // a "load more" for a query that has since changed
  if (error) return { query, rows: same?.rows ?? [], cursor: same?.cursor, error };
  return { query, rows: from && same ? [...same.rows, ...data] : data, cursor: nextCursor(data) };
}
