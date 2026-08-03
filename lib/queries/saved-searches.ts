import { sql } from "../db";

export type SavedSearch = { savedSearchId: number; name: string; queryString: string };

export async function listSavedSearches(userId: string): Promise<SavedSearch[]> {
  return sql<SavedSearch[]>`
    SELECT saved_search_id AS "savedSearchId", name_text AS name, query_string_text AS "queryString"
    FROM bayanat.saved_searches WHERE user_id = ${userId} ORDER BY created_at DESC
  `;
}

export async function createSavedSearch(userId: string, name: string, queryString: string): Promise<SavedSearch> {
  const [row] = await sql<SavedSearch[]>`
    INSERT INTO bayanat.saved_searches (user_id, name_text, query_string_text)
    VALUES (${userId}, ${name}, ${queryString})
    RETURNING saved_search_id AS "savedSearchId", name_text AS name, query_string_text AS "queryString"
  `;
  return row;
}

export async function deleteSavedSearch(userId: string, savedSearchId: number): Promise<void> {
  await sql`DELETE FROM bayanat.saved_searches WHERE saved_search_id = ${savedSearchId} AND user_id = ${userId}`;
}
