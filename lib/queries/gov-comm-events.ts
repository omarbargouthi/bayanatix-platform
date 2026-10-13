// The Communication Plan's schedule (Governance Framework › Communication Plan): training
// and awareness sessions, updates on a policy, procedure, strategy or roadmap, key events
// and announcements. Upcoming ones are advertised on the Dashboard (gov-announcements.ts).
import { sql } from "../db";
import { COMM_EVENT_TYPES, COMM_EVENT_STATUSES } from "../gov-framework-sections";

export type CommEvent = {
  eventId: number; title: string; description: string | null; typeCode: string;
  eventDate: string; endDate: string | null; timeText: string | null;
  location: string | null; audience: string | null; channel: string | null;
  statusCode: string; announce: boolean;
};

export type CommEventInput = {
  title?: string; description?: string | null; typeCode?: string;
  eventDate?: string; endDate?: string | null; timeText?: string | null;
  location?: string | null; audience?: string | null; channel?: string | null;
  statusCode?: string; announce?: boolean;
};

export class CommEventError extends Error {}

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

function clean(data: CommEventInput) {
  const title = text(data.title);
  if (!title) throw new CommEventError("A title is required.");
  if (!isDate(data.eventDate)) throw new CommEventError("A date is required.");
  const endDate = isDate(data.endDate) ? data.endDate : null;
  if (endDate && endDate < data.eventDate) throw new CommEventError("The end date is before the start date.");
  return {
    title, description: text(data.description),
    typeCode: (COMM_EVENT_TYPES as readonly string[]).includes(data.typeCode ?? "") ? data.typeCode! : "ANNOUNCEMENT",
    eventDate: data.eventDate, endDate, timeText: text(data.timeText),
    location: text(data.location), audience: text(data.audience), channel: text(data.channel),
    statusCode: (COMM_EVENT_STATUSES as readonly string[]).includes(data.statusCode ?? "") ? data.statusCode! : "PLANNED",
    announce: data.announce !== false,
  };
}

export async function listCommEvents(): Promise<CommEvent[]> {
  return sql<CommEvent[]>`
    SELECT event_id AS "eventId", title, description, event_type_code AS "typeCode",
           event_date::text AS "eventDate", end_date::text AS "endDate", time_text AS "timeText",
           location_text AS location, audience_text AS audience, channel_text AS channel,
           status_code AS "statusCode", announce_indicator AS announce
    FROM   bayanat.gov_comm_events
    ORDER  BY event_date, event_id
  `;
}

export async function createCommEvent(data: CommEventInput, userId: string): Promise<number> {
  const e = clean(data);
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.gov_comm_events
      (title, description, event_type_code, event_date, end_date, time_text, location_text, audience_text, channel_text, status_code, announce_indicator, created_by)
    VALUES (${e.title}, ${e.description}, ${e.typeCode}, ${e.eventDate}, ${e.endDate}, ${e.timeText}, ${e.location}, ${e.audience}, ${e.channel}, ${e.statusCode}, ${e.announce}, ${userId})
    RETURNING event_id AS id
  `;
  return row.id;
}

/** Replaces the event with what the form holds. */
export async function updateCommEvent(eventId: number, data: CommEventInput): Promise<boolean> {
  const e = clean(data);
  const rows = await sql`
    UPDATE bayanat.gov_comm_events SET
      title = ${e.title}, description = ${e.description}, event_type_code = ${e.typeCode},
      event_date = ${e.eventDate}, end_date = ${e.endDate}, time_text = ${e.timeText},
      location_text = ${e.location}, audience_text = ${e.audience}, channel_text = ${e.channel},
      status_code = ${e.statusCode}, announce_indicator = ${e.announce}, updated_at = now()
    WHERE event_id = ${eventId}
    RETURNING event_id
  `;
  return rows.length > 0;
}

export async function deleteCommEvent(eventId: number): Promise<void> {
  await sql`DELETE FROM bayanat.gov_comm_events WHERE event_id = ${eventId}`;
}
