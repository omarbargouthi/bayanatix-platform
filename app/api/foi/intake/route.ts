import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

// Public endpoint — no authentication required.
// Rate limiting should be applied at the reverse-proxy/CDN layer.
export async function POST(req: Request) {
  let body: {
    requesterType?: string;
    fullName?: string;
    email?: string;
    phone?: string;
    nationalId?: string;
    preferredLanguage?: string;
    subject?: string;
    description?: string;
    domainCode?: string | null;
    requestedFormat?: string;
    channel?: string;
    attributes?: { name: string; description?: string; formatHint?: string }[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { fullName, email, subject, description } = body;
  if (!fullName?.trim())    return NextResponse.json({ error: "Full name is required" }, { status: 400 });
  if (!email?.trim())       return NextResponse.json({ error: "Email is required" }, { status: 400 });
  if (!subject?.trim())     return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  if (!description?.trim()) return NextResponse.json({ error: "Description is required" }, { status: 400 });

  try {
    const [requester] = await sql`
      INSERT INTO bayanat.foi_requesters
        (requester_type_code, full_name_text, email_text, phone_text,
         national_id_or_cr_text, preferred_language_code)
      VALUES (
        ${body.requesterType ?? "INDIVIDUAL"},
        ${fullName.trim()},
        ${email.trim().toLowerCase()},
        ${body.phone?.trim() || null},
        ${body.nationalId?.trim() || null},
        ${body.preferredLanguage ?? "ar"}
      )
      RETURNING requester_id AS "requesterId"
    `;

    const [request] = await sql`
      INSERT INTO bayanat.foi_requests
        (requester_id, channel_code, subject_text, description_text,
         domain_code, requested_format_code, status_code)
      VALUES (
        ${requester.requesterId},
        ${body.channel ?? "PORTAL"},
        ${subject.trim()},
        ${description.trim()},
        ${body.domainCode || null},
        ${body.requestedFormat ?? "PDF"},
        'SUBMITTED'
      )
      RETURNING foi_request_id AS "foiRequestId", reference_code AS "referenceCode", access_token AS "accessToken"
    `;

    // Save structured requested attributes
    const attrs = body.attributes ?? [];
    for (let i = 0; i < attrs.length; i++) {
      const a = attrs[i];
      if (!a.name?.trim()) continue;
      await sql`
        INSERT INTO bayanat.foi_requested_attributes
          (foi_request_id, attribute_name_text, description_text, format_hint_text, sort_order)
        VALUES (${request.foiRequestId}, ${a.name.trim()}, ${a.description?.trim() || null}, ${a.formatHint?.trim() || null}, ${i})
      `;
    }

    // Log acknowledgment communication
    await sql`
      INSERT INTO bayanat.foi_communications
        (foi_request_id, direction_code, message_type_code, subject_text, body_text, channel_code)
      VALUES (
        ${request.foiRequestId},
        'OUTBOUND',
        'ACK',
        ${'Request received: ' + subject.trim()},
        ${'Your information request has been received and registered under reference ' + request.referenceCode + '. We will process your request within 30 business days.'},
        'PORTAL'
      )
    `;

    return NextResponse.json({
      foiRequestId:  request.foiRequestId,
      referenceCode: request.referenceCode,
      accessToken:   request.accessToken,
      trackingUrl:   `/foi-request/track/${request.accessToken}`,
    }, { status: 201 });
  } catch (err) {
    console.error("[FOI INTAKE]", err);
    return NextResponse.json({ error: "Failed to register request" }, { status: 500 });
  }
}
