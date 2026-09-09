"use client";

import { useRef, useState } from "react";

import {
  ApiError,
  merchantApi,
  type DocumentType,
  type MerchantCompliance,
  type MerchantContact,
  type MerchantDocument,
} from "@/lib/api";
import { FONT_MONO, card, fieldLabel, iconBtn, toneBadge } from "@/lib/ui";

// Mirrors the server-side allowlist in backend/routers/merchants.py. The server
// also sniffs the leading bytes, so this is a courtesy to save a failed upload,
// never the actual check.
const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "image/tiff"];
const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png,.tif,.tiff";
const MAX_BYTES = 20 * 1024 * 1024;

const sectionTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  margin: "0 0 4px",
};

const helpText: React.CSSProperties = {
  fontSize: 13,
  color: "var(--muted)",
  margin: "0 0 16px",
  lineHeight: 1.55,
};

const requirement: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text)",
  margin: "0 0 6px",
  lineHeight: 1.5,
};

function contactName(contact: MerchantContact): string {
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ");
  return name || contact.contact_type;
}

/** One upload slot: says what is needed, takes one file, shows what landed. */
function UploadRow({
  title,
  hint,
  documentType,
  contactId,
  venueId,
  documents,
  onUploaded,
}: {
  title: string;
  hint: string;
  documentType: DocumentType;
  contactId?: string | null;
  venueId: string;
  documents: MerchantDocument[];
  onUploaded: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const supplied = documents.filter(
    (d) => d.document_type === documentType && (d.pinch_contact_id ?? null) === (contactId ?? null)
  );

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);

    if (!ACCEPTED.includes(file.type)) {
      setError("Must be a PDF, JPG, PNG or TIFF.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Must be under 20MB.");
      return;
    }

    setBusy(true);
    try {
      await merchantApi.uploadDocument(venueId, documentType, file, contactId);
      onUploaded();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const { badge, dot } = toneBadge(supplied.length > 0 ? "good" : "neutral");

  return (
    <div
      style={{
        border: "1px solid var(--line2)",
        borderRadius: 14,
        padding: 18,
        marginBottom: 12,
        background: "var(--sunken)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>{hint}</div>
        </div>
        <span style={badge}>
          <span style={dot} />
          {supplied.length > 0 ? `${supplied.length} uploaded` : "Outstanding"}
        </span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          style={{
            ...iconBtn,
            width: "auto",
            padding: "0 14px",
            height: 34,
            fontWeight: 600,
            opacity: busy ? 0.6 : 1,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Uploading…" : supplied.length > 0 ? "Add another" : "Upload"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          onChange={handleChange}
          style={{ display: "none" }}
        />
      </div>

      {supplied.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {supplied.map((d) => (
            <span
              key={d.id}
              style={{
                fontFamily: FONT_MONO,
                fontSize: 11,
                padding: "4px 10px",
                borderRadius: 999,
                background: "var(--surface2)",
                color: "var(--muted)",
                border: "1px solid var(--line2)",
              }}
            >
              {d.label}
            </span>
          ))}
        </div>
      )}

      {error && (
        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", margin: "10px 0 0" }}>
          {error}
        </p>
      )}
    </div>
  );
}

export default function ComplianceDocuments({
  venueId,
  compliance,
  onUploaded,
}: {
  venueId: string;
  compliance: MerchantCompliance;
  onUploaded: () => void;
}) {
  const documents = compliance.documents;

  return (
    <div>
      {/* Stated plainly on screen, not in a tooltip. The most common rejection by
          far is a black-and-white scan of one side of a licence. */}
      <div style={{ ...card, padding: 24, marginBottom: 22, background: "var(--accent-soft)", borderColor: "transparent" }}>
        <h3 style={{ ...sectionTitle, color: "var(--accent)" }}>Before you upload — read this</h3>
        <p style={{ ...requirement, color: "var(--text)" }}>
          <strong>In colour.</strong> A black-and-white scan or photocopy will be rejected.
        </p>
        <p style={requirement}>
          <strong>Current, not expired.</strong>
        </p>
        <p style={requirement}>
          <strong>A driver&rsquo;s licence needs both sides</strong> — front <em>and</em> back,
          uploaded separately. The licence number and the current residential address must both
          be readable.
        </p>
        <p style={{ ...requirement, marginBottom: 0 }}>
          Using a passport instead? It must be accompanied by a recent utility bill showing the
          same residential address.
        </p>
      </div>

      <div style={{ ...card, padding: 28, marginBottom: 22 }}>
        <h3 style={sectionTitle}>Photo ID for each person</h3>
        <p style={helpText}>
          Required for every director and for anyone holding 25% or more of the shares. Upload the
          front and the back of a licence as two separate files.
        </p>
        {compliance.contacts.map((contact) => (
          <UploadRow
            key={contact.contact_id}
            title={contactName(contact)}
            hint={
              contact.is_ubo || (contact.ownership ?? 0) >= 25
                ? `${contact.contact_type} · beneficial owner`
                : contact.contact_type
            }
            documentType="identity-document"
            contactId={contact.contact_id}
            venueId={venueId}
            documents={documents}
            onUploaded={onUploaded}
          />
        ))}
      </div>

      <div style={{ ...card, padding: 28, marginBottom: 22 }}>
        <h3 style={sectionTitle}>Business documents</h3>
        <p style={helpText}>One bank statement and one proof of registration.</p>

        <UploadRow
          title="Bank statement"
          hint="Issued in the last 3 months · at least 1 month of transactions · unredacted · in the company's name. Pinch cannot settle to a personal account for a Pty Ltd."
          documentType="financial-document"
          venueId={venueId}
          documents={documents}
          onUploaded={onUploaded}
        />
        <UploadRow
          title="Business registration"
          hint="ASIC company extract, ABN registration, or equivalent."
          documentType="business-registration"
          venueId={venueId}
          documents={documents}
          onUploaded={onUploaded}
        />
        <UploadRow
          title="Anything else Pinch asks for"
          hint="Optional — e.g. a trust deed if the company's shares are held in a trust."
          documentType="additional-verification"
          venueId={venueId}
          documents={documents}
          onUploaded={onUploaded}
        />
      </div>

      <p style={{ ...fieldLabel, marginBottom: 0 }}>
        Documents are sent straight to Pinch. Impulse never stores them.
      </p>
    </div>
  );
}
