/**
 * AgentMail email provider — alternative to Gmail/gog.
 *
 * Creates a dedicated @agentmail.to inbox for receiving vendor billing emails.
 * DKIM signatures arrive intact (no forwarding). User changes their vendor
 * billing emails to the AgentMail address and receipts flow in directly.
 *
 * API docs: https://docs.agentmail.to
 */

const AGENTMAIL_API_BASE = "https://api.agentmail.to/v0";

export interface AgentMailConfig {
  apiKey: string;
}

export interface AgentMailInbox {
  inboxId: string;
  address: string;
  displayName: string | null;
}

export interface AgentMailAddress {
  email: string;
  name?: string;
}

export interface AgentMailMessage {
  messageId: string;
  inboxId: string;
  from: AgentMailAddress[];
  subject: string;
  timestamp: string;
}

/** Create a new AgentMail inbox for receiving vendor receipts */
export async function createInbox(
  config: AgentMailConfig,
  username?: string
): Promise<AgentMailInbox> {
  const body: Record<string, string> = {};
  if (username) body.username = username;
  body.display_name = "Crinkl Receipts";

  const response = await fetch(`${AGENTMAIL_API_BASE}/inboxes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`AgentMail create inbox failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    inbox_id: string;
    display_name?: string;
  };

  // Inbox address: username@agentmail.to (inbox_id is used for API calls)
  const address = username
    ? `${username}@agentmail.to`
    : `${data.inbox_id}@agentmail.to`;

  return {
    inboxId: data.inbox_id,
    address,
    displayName: data.display_name || null,
  };
}

/** List recent messages in an AgentMail inbox */
export async function listMessages(
  config: AgentMailConfig,
  inboxId: string,
  opts?: { limit?: number; after?: string }
): Promise<AgentMailMessage[]> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.after) params.set("after", opts.after);

  const url = `${AGENTMAIL_API_BASE}/inboxes/${encodeURIComponent(inboxId)}/messages?${params}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });

  if (!response.ok) {
    throw new Error(`AgentMail list messages failed (${response.status})`);
  }

  const data = (await response.json()) as {
    messages: Array<{
      message_id: string;
      inbox_id: string;
      from: Array<{ email: string; name?: string }>;
      subject: string;
      timestamp: string;
    }>;
  };

  return data.messages.map((m) => ({
    messageId: m.message_id,
    inboxId: m.inbox_id,
    from: m.from || [],
    subject: m.subject,
    timestamp: m.timestamp,
  }));
}

/** Download raw .eml content for a message (required for DKIM verification) */
export async function downloadRawEml(
  config: AgentMailConfig,
  inboxId: string,
  messageId: string
): Promise<string> {
  const url = `${AGENTMAIL_API_BASE}/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}/raw`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });

  if (!response.ok) {
    throw new Error(`AgentMail download raw message failed (${response.status})`);
  }

  return response.text();
}

/** Extract the sender email from the AgentMail from field (array of {email, name}) */
export function senderEmail(from: AgentMailAddress[]): string | null {
  return from.length > 0 ? from[0].email : null;
}

/** Extract domain from a sender email address */
export function senderDomain(from: AgentMailAddress[]): string | null {
  const email = senderEmail(from);
  if (!email) return null;
  const at = email.lastIndexOf("@");
  return at > 0 ? email.slice(at + 1).toLowerCase() : null;
}
