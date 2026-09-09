"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import ComplianceDocuments from "@/components/ComplianceDocuments";
import { useVenue } from "@/providers/VenueProvider";
import {
  ApiError,
  merchantApi,
  type ContactType,
  type MerchantContactInput,
  type OnboardingDraft,
} from "@/lib/api";
import {
  FONT_DISPLAY,
  FONT_MONO,
  btnGhost,
  btnPrimary,
  card,
  eyebrow,
  fieldInput,
  fieldLabel,
  iconBtnDanger,
  requiredMark,
  switchKnob,
  switchTrack,
  toneBadge,
  type Tone,
} from "@/lib/ui";

// Pinch forces part of this ordering: contacts only exist once the merchant has
// been created, and an ID document has to be attached to a contact — so the
// account is created when the People step is completed, and Documents comes after.
const STEPS = [
  { key: "business", label: "Business" },
  { key: "bank", label: "Bank" },
  { key: "declarations", label: "Declarations" },
  { key: "people", label: "People" },
  { key: "documents", label: "Documents" },
  { key: "review", label: "Review" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

const CONTACT_TYPES: ContactType[] = ["director", "owner", "shareholder", "executive"];

const STATUS_TONE: Record<string, Tone> = {
  "in-progress": "info",
  pending: "info",
  "in-review": "info",
  approved: "good",
  rejected: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  "in-progress": "In progress",
  pending: "Pending review",
  "in-review": "Under review",
  approved: "Approved",
  rejected: "Needs attention",
};

type FieldErrors = Partial<Record<string, string>>;

const errStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--accent)",
  margin: "8px 0 0",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  margin: "0 0 18px",
};

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 18,
};

const EMPTY_CONTACT: MerchantContactInput = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  contact_type: "director",
  is_primary_contact: false,
  is_ubo: false,
  ownership: null,
  dob: "",
  street_address: "",
  suburb: "",
  state: "",
  postcode: "",
  country: "AU",
};

const EMPTY_DRAFT: OnboardingDraft = {
  company_name: "",
  legal_entity_name: "",
  company_email: "",
  company_phone: "",
  company_website_url: "",
  abn: "",
  nature_of_business: "",
  organisation_type: "",
  legal_street_address: "",
  legal_suburb: "",
  legal_state: "",
  legal_postcode: "",
  legal_country: "AU",
  bank_account_name: "",
  bank_bsb: "",
  bank_account_number: "",
  afsl_held: null,
  afsl_number: "",
  austrac_registered: null,
  shares_held_in_trust: null,
  contacts: [{ ...EMPTY_CONTACT, is_primary_contact: true }],
  completed_steps: [],
};

function validate(step: StepKey, draft: OnboardingDraft): FieldErrors {
  const errs: FieldErrors = {};
  if (step === "business") {
    if (!draft.company_name?.trim()) errs.company_name = "Registered company name is required";
    if (!draft.company_email?.trim()) {
      errs.company_email = "A company email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.company_email)) {
      errs.company_email = "Enter a valid email address";
    }
    const abn = (draft.abn ?? "").replace(/\D/g, "");
    if (!abn) {
      errs.abn = "ABN is required";
    } else if (abn.length !== 11) {
      errs.abn = "An ABN is 11 digits";
    }
  }
  if (step === "bank") {
    if (!draft.bank_account_name?.trim()) {
      errs.bank_account_name = "Account name is required";
    }
    const bsb = (draft.bank_bsb ?? "").replace(/\D/g, "");
    if (bsb.length !== 6) errs.bank_bsb = "A BSB is 6 digits";
    const acct = (draft.bank_account_number ?? "").replace(/\D/g, "");
    if (acct.length < 3 || acct.length > 9) {
      errs.bank_account_number = "An account number is between 3 and 9 digits";
    }
  }
  if (step === "declarations") {
    if (draft.afsl_held === null) errs.afsl_held = "Please answer this";
    if (draft.afsl_held && !draft.afsl_number?.trim()) {
      errs.afsl_number = "Enter the AFSL number";
    }
    if (draft.austrac_registered === null) errs.austrac_registered = "Please answer this";
  }
  if (step === "people") {
    if (draft.contacts.length === 0) errs.contacts = "Add at least one person";
    draft.contacts.forEach((c, i) => {
      if (!c.email?.trim()) errs[`contact_${i}_email`] = "Email is required";
      if (!c.first_name?.trim()) errs[`contact_${i}_first_name`] = "First name is required";
      if (!c.last_name?.trim()) errs[`contact_${i}_last_name`] = "Last name is required";
    });
    const owned = draft.contacts.reduce((sum, c) => sum + (c.ownership ?? 0), 0);
    if (owned > 100) errs.contacts = "Ownership across everyone cannot exceed 100%";
  }
  return errs;
}

export default function PaymentsSetupPage() {
  const { venue, loading } = useVenue();
  const qc = useQueryClient();

  // Local edits, or null when nothing has been touched yet. The draft actually
  // rendered is derived below, so the saved draft can arrive from the server
  // without an effect copying it into state.
  const [localDraft, setLocalDraft] = useState<OnboardingDraft | null>(null);
  const [localStep, setLocalStep] = useState<StepKey | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: compliance, refetch: refetchStatus } = useQuery({
    queryKey: ["merchant-status", venue?.id],
    queryFn: () => merchantApi.status(venue!.id),
    enabled: !!venue,
    // Compliance review is a human at Pinch, so this changes on their clock, not ours.
    refetchInterval: 60_000,
  });

  const { data: savedDraft } = useQuery({
    queryKey: ["merchant-draft", venue?.id],
    queryFn: () => merchantApi.getDraft(venue!.id),
    enabled: !!venue && !compliance?.pinch_merchant_id,
  });

  if (loading) return <div style={{ padding: "38px 44px", color: "var(--muted)" }}>Loading…</div>;
  if (!venue) return null;

  const created = !!compliance?.pinch_merchant_id;

  // A form abandoned on another device comes back here, without an effect.
  const draft: OnboardingDraft =
    localDraft ??
    (savedDraft
      ? {
          ...EMPTY_DRAFT,
          ...Object.fromEntries(
            Object.entries(savedDraft).filter(([, v]) => v !== null && v !== undefined)
          ),
          contacts: savedDraft.contacts?.length ? savedDraft.contacts : EMPTY_DRAFT.contacts,
        }
      : EMPTY_DRAFT);

  // Once the merchant exists the form steps are behind us; what remains is documents.
  const step: StepKey =
    localStep ?? (created ? (compliance!.documents.length > 0 ? "review" : "documents") : "business");
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  const setDraft = (update: (d: OnboardingDraft) => OnboardingDraft) =>
    setLocalDraft((d) => update(d ?? draft));
  const setStep = (next: StepKey) => setLocalStep(next);

  function setField<K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key as string]: undefined }));
  }

  function setContact(index: number, patch: Partial<MerchantContactInput>) {
    setDraft((d) => ({
      ...d,
      contacts: d.contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
    setFieldErrors((e) => {
      const next = { ...e };
      Object.keys(patch).forEach((k) => delete next[`contact_${index}_${k}`]);
      return next;
    });
  }

  async function goNext() {
    setError(null);
    const errs = validate(step, draft);
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setSaving(true);
    try {
      const completed = Array.from(new Set([...draft.completed_steps, step]));
      await merchantApi.saveDraft(venue!.id, { ...draft, completed_steps: completed });
      setDraft((d) => ({ ...d, completed_steps: completed }));

      if (step === "people") {
        // Creating the account here is forced by Pinch: an identity document can
        // only be attached to a contact, and contacts do not exist until now.
        await merchantApi.create(venue!.id);
        await qc.invalidateQueries({ queryKey: ["merchant-status", venue!.id] });
        await qc.invalidateQueries({ queryKey: ["my-venues"] });
        setStep("documents");
        return;
      }
      setStep(STEPS[stepIndex + 1].key);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const status = compliance?.submission_status ?? null;
  const tone = STATUS_TONE[status ?? ""] ?? "neutral";
  const { badge, dot } = toneBadge(tone);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "38px 44px 80px" }}>
      <div style={{ ...eyebrow, marginBottom: 8 }}>Payments setup</div>
      <h1
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 700,
          fontSize: 32,
          letterSpacing: "-.02em",
          margin: "0 0 6px",
        }}
      >
        Get paid directly
      </h1>
      <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 26px", maxWidth: 640 }}>
        Pinch, our payments provider, has to verify your business before takings can settle to your
        own bank account. This is a one-off. Your progress saves as you go, so you can stop and come
        back on any device.
      </p>
      <p style={{ ...fieldLabel, marginBottom: 26 }}>
        <span style={requiredMark}>*</span> Required
      </p>

      {/* ── Status ─────────────────────────────────────────────────────────── */}
      {created && (
        <div style={{ ...card, padding: 22, marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={badge}>
              <span style={dot} />
              {STATUS_LABEL[status ?? ""] ?? "Submitted"}
            </span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: "var(--faint)" }}>
              {compliance?.pinch_merchant_id}
            </span>
          </div>
          <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "14px 0 0", lineHeight: 1.6 }}>
            {status === "approved"
              ? "You're verified. Deals you publish will settle to your account."
              : status === "rejected"
                ? "Pinch needs something corrected before they can approve you. Replace the document below and it goes back for review automatically."
                : "A person at Pinch reviews these, usually within a few business days. You can publish deals as drafts in the meantime — they'll go live once you're approved."}
          </p>
          {compliance?.compliance_notes && (
            <p
              style={{
                fontSize: 13,
                margin: "14px 0 0",
                padding: "12px 14px",
                borderRadius: 12,
                background: "var(--accent-soft)",
                color: "var(--accent)",
              }}
            >
              {compliance.compliance_notes}
            </p>
          )}
          {(compliance?.outstanding.length ?? 0) > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ ...fieldLabel, marginBottom: 8 }}>Still outstanding</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.8 }}>
                {compliance!.outstanding.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Step rail ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
        {STEPS.map((s, i) => {
          const done = draft.completed_steps.includes(s.key) || (created && i < 4);
          const current = s.key === step;
          const reachable = created ? i >= 4 : done || i <= stepIndex;
          return (
            <button
              key={s.key}
              type="button"
              disabled={!reachable}
              onClick={() => reachable && setStep(s.key)}
              style={{
                fontFamily: FONT_MONO,
                fontSize: 11,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                padding: "7px 13px",
                borderRadius: 999,
                cursor: reachable ? "pointer" : "not-allowed",
                border: `1px solid ${current ? "transparent" : "var(--line2)"}`,
                background: current ? "var(--accent)" : done ? "var(--accent-soft)" : "var(--surface)",
                color: current ? "var(--accent-ink)" : done ? "var(--accent)" : "var(--faint)",
                opacity: reachable ? 1 : 0.5,
              }}
            >
              {i + 1}. {s.label}
            </button>
          );
        })}
      </div>

      {error && (
        <p
          style={{
            borderRadius: 12,
            padding: "12px 16px",
            marginBottom: 20,
            fontSize: 13,
            background: "var(--accent-soft)",
            color: "var(--accent)",
          }}
        >
          {error}
        </p>
      )}

      {/* ── Steps ──────────────────────────────────────────────────────────── */}
      {step === "business" && (
        <div style={{ ...card, padding: 28, marginBottom: 22 }}>
          <h3 style={sectionTitle}>Business details</h3>
          <div style={grid2}>
            <div>
              <label style={fieldLabel}>Registered company name<span style={requiredMark}>*</span></label>
              <input
                value={draft.company_name ?? ""}
                onChange={(e) => setField("company_name", e.target.value)}
                placeholder="e.g. The Lantern Room Pty Ltd"
                style={{ ...fieldInput, borderColor: fieldErrors.company_name ? "var(--accent)" : "var(--line2)" }}
              />
              {fieldErrors.company_name && <p style={errStyle}>{fieldErrors.company_name}</p>}
            </div>
            <div>
              <label style={fieldLabel}>ABN<span style={requiredMark}>*</span></label>
              <input
                value={draft.abn ?? ""}
                onChange={(e) => setField("abn", e.target.value)}
                placeholder="e.g. 12 345 678 901"
                style={{ ...fieldInput, borderColor: fieldErrors.abn ? "var(--accent)" : "var(--line2)" }}
              />
              {fieldErrors.abn && <p style={errStyle}>{fieldErrors.abn}</p>}
            </div>
            <div>
              <label style={fieldLabel}>Company email<span style={requiredMark}>*</span></label>
              <input
                value={draft.company_email ?? ""}
                onChange={(e) => setField("company_email", e.target.value)}
                placeholder="e.g. accounts@yourvenue.com.au"
                style={{ ...fieldInput, borderColor: fieldErrors.company_email ? "var(--accent)" : "var(--line2)" }}
              />
              {fieldErrors.company_email && <p style={errStyle}>{fieldErrors.company_email}</p>}
            </div>
            <div>
              <label style={fieldLabel}>Company phone <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
              <input
                value={draft.company_phone ?? ""}
                onChange={(e) => setField("company_phone", e.target.value)}
                placeholder="e.g. 02 9000 0000"
                style={fieldInput}
              />
            </div>
            <div>
              <label style={fieldLabel}>Street address <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
              <input
                value={draft.legal_street_address ?? ""}
                onChange={(e) => setField("legal_street_address", e.target.value)}
                placeholder="e.g. 123 Main St"
                style={fieldInput}
              />
            </div>
            <div>
              <label style={fieldLabel}>Suburb <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
              <input
                value={draft.legal_suburb ?? ""}
                onChange={(e) => setField("legal_suburb", e.target.value)}
                style={fieldInput}
              />
            </div>
            <div>
              <label style={fieldLabel}>State <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
              <input
                value={draft.legal_state ?? ""}
                onChange={(e) => setField("legal_state", e.target.value)}
                placeholder="e.g. NSW"
                style={fieldInput}
              />
            </div>
            <div>
              <label style={fieldLabel}>Postcode <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
              <input
                value={draft.legal_postcode ?? ""}
                onChange={(e) => setField("legal_postcode", e.target.value)}
                style={fieldInput}
              />
            </div>
          </div>
        </div>
      )}

      {step === "bank" && (
        <div style={{ ...card, padding: 28, marginBottom: 22 }}>
          <h3 style={sectionTitle}>Where your money goes</h3>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "-8px 0 18px", lineHeight: 1.55 }}>
            The account name has to match your registered company name. Pinch cannot settle to a
            personal account for a Pty Ltd. You&rsquo;ll upload a statement for this account later.
          </p>
          <div style={grid2}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={fieldLabel}>Account name<span style={requiredMark}>*</span></label>
              <input
                value={draft.bank_account_name ?? ""}
                onChange={(e) => setField("bank_account_name", e.target.value)}
                placeholder="e.g. The Lantern Room Pty Ltd"
                style={{ ...fieldInput, borderColor: fieldErrors.bank_account_name ? "var(--accent)" : "var(--line2)" }}
              />
              {fieldErrors.bank_account_name && <p style={errStyle}>{fieldErrors.bank_account_name}</p>}
            </div>
            <div>
              <label style={fieldLabel}>BSB<span style={requiredMark}>*</span></label>
              <input
                value={draft.bank_bsb ?? ""}
                onChange={(e) => setField("bank_bsb", e.target.value)}
                placeholder="e.g. 062-000"
                inputMode="numeric"
                style={{ ...fieldInput, borderColor: fieldErrors.bank_bsb ? "var(--accent)" : "var(--line2)" }}
              />
              {fieldErrors.bank_bsb && <p style={errStyle}>{fieldErrors.bank_bsb}</p>}
            </div>
            <div>
              <label style={fieldLabel}>Account number<span style={requiredMark}>*</span></label>
              <input
                value={draft.bank_account_number ?? ""}
                onChange={(e) => setField("bank_account_number", e.target.value)}
                placeholder="e.g. 12345678"
                inputMode="numeric"
                style={{ ...fieldInput, borderColor: fieldErrors.bank_account_number ? "var(--accent)" : "var(--line2)" }}
              />
              {fieldErrors.bank_account_number && <p style={errStyle}>{fieldErrors.bank_account_number}</p>}
            </div>
          </div>
        </div>
      )}

      {step === "declarations" && (
        <div style={{ ...card, padding: 28, marginBottom: 22 }}>
          <h3 style={sectionTitle}>Regulatory declarations</h3>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "-8px 0 22px", lineHeight: 1.55 }}>
            Most hospitality venues answer no to all of these.
          </p>

          {[
            { key: "afsl_held" as const, label: "Does the business hold an AFSL?", hint: "Australian Financial Services Licence" },
            { key: "austrac_registered" as const, label: "Is the business registered with AUSTRAC?", hint: "Required for remittance and digital currency services" },
            { key: "shares_held_in_trust" as const, label: "Are the company's shares held in a trust?", hint: "If yes, upload the trust deed on the documents step" },
          ].map(({ key, label, hint }) => (
            <div
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "14px 0",
                borderBottom: "1px solid var(--line)",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>{hint}</div>
                {fieldErrors[key] && <p style={errStyle}>{fieldErrors[key]}</p>}
              </div>
              <button
                type="button"
                onClick={() => setField(key, !draft[key])}
                style={switchTrack(!!draft[key])}
                aria-label={label}
              >
                <span style={switchKnob(!!draft[key])} />
              </button>
            </div>
          ))}

          {draft.afsl_held && (
            <div style={{ marginTop: 20 }}>
              <label style={fieldLabel}>AFSL number</label>
              <input
                value={draft.afsl_number ?? ""}
                onChange={(e) => setField("afsl_number", e.target.value)}
                style={{ ...fieldInput, borderColor: fieldErrors.afsl_number ? "var(--accent)" : "var(--line2)" }}
              />
              {fieldErrors.afsl_number && <p style={errStyle}>{fieldErrors.afsl_number}</p>}
            </div>
          )}
        </div>
      )}

      {step === "people" && (
        <div style={{ ...card, padding: 28, marginBottom: 22 }}>
          <h3 style={sectionTitle}>Directors and beneficial owners</h3>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "-8px 0 22px", lineHeight: 1.55 }}>
            Every director, plus anyone holding 25% or more of the shares. Each person here will
            need to supply photo ID on the next step.
          </p>

          {draft.contacts.map((contact, i) => (
            <div
              key={i}
              style={{
                border: "1px solid var(--line2)",
                borderRadius: 14,
                padding: 20,
                marginBottom: 14,
                background: "var(--sunken)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
                <div style={{ ...fieldLabel, marginBottom: 0, flex: 1 }}>
                  Person {i + 1}
                  {contact.is_primary_contact ? " · main contact" : ""}
                </div>
                {draft.contacts.length > 1 && (
                  <button
                    type="button"
                    aria-label="Remove this person"
                    onClick={() =>
                      setDraft((d) => ({ ...d, contacts: d.contacts.filter((_, j) => j !== i) }))
                    }
                    style={iconBtnDanger}
                  >
                    ✕
                  </button>
                )}
              </div>

              <div style={grid2}>
                <div>
                  <label style={fieldLabel}>First name<span style={requiredMark}>*</span></label>
                  <input
                    value={contact.first_name ?? ""}
                    onChange={(e) => setContact(i, { first_name: e.target.value })}
                    style={{ ...fieldInput, borderColor: fieldErrors[`contact_${i}_first_name`] ? "var(--accent)" : "var(--line2)" }}
                  />
                  {fieldErrors[`contact_${i}_first_name`] && (
                    <p style={errStyle}>{fieldErrors[`contact_${i}_first_name`]}</p>
                  )}
                </div>
                <div>
                  <label style={fieldLabel}>Last name<span style={requiredMark}>*</span></label>
                  <input
                    value={contact.last_name ?? ""}
                    onChange={(e) => setContact(i, { last_name: e.target.value })}
                    style={{ ...fieldInput, borderColor: fieldErrors[`contact_${i}_last_name`] ? "var(--accent)" : "var(--line2)" }}
                  />
                  {fieldErrors[`contact_${i}_last_name`] && (
                    <p style={errStyle}>{fieldErrors[`contact_${i}_last_name`]}</p>
                  )}
                </div>
                <div>
                  <label style={fieldLabel}>Email<span style={requiredMark}>*</span></label>
                  <input
                    value={contact.email ?? ""}
                    onChange={(e) => setContact(i, { email: e.target.value })}
                    style={{ ...fieldInput, borderColor: fieldErrors[`contact_${i}_email`] ? "var(--accent)" : "var(--line2)" }}
                  />
                  {fieldErrors[`contact_${i}_email`] && (
                    <p style={errStyle}>{fieldErrors[`contact_${i}_email`]}</p>
                  )}
                </div>
                <div>
                  <label style={fieldLabel}>Phone <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
                  <input
                    value={contact.phone ?? ""}
                    onChange={(e) => setContact(i, { phone: e.target.value })}
                    style={fieldInput}
                  />
                </div>
                <div>
                  <label style={fieldLabel}>Role <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
                  <select
                    value={contact.contact_type}
                    onChange={(e) => setContact(i, { contact_type: e.target.value as ContactType })}
                    style={fieldInput}
                  >
                    {CONTACT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={fieldLabel}>Date of birth <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
                  <input
                    type="date"
                    value={contact.dob ?? ""}
                    onChange={(e) => setContact(i, { dob: e.target.value })}
                    style={fieldInput}
                  />
                </div>
                <div>
                  <label style={fieldLabel}>Shareholding % <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={contact.ownership ?? ""}
                    onChange={(e) =>
                      setContact(i, {
                        ownership: e.target.value === "" ? null : Number(e.target.value),
                        is_ubo: Number(e.target.value) >= 25,
                      })
                    }
                    placeholder="0"
                    style={fieldInput}
                  />
                </div>
                <div>
                  <label style={fieldLabel}>Residential address <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
                  <input
                    value={contact.street_address ?? ""}
                    onChange={(e) => setContact(i, { street_address: e.target.value })}
                    placeholder="Must match their photo ID"
                    style={fieldInput}
                  />
                </div>
              </div>
            </div>
          ))}

          {fieldErrors.contacts && <p style={errStyle}>{fieldErrors.contacts}</p>}

          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, contacts: [...d.contacts, { ...EMPTY_CONTACT }] }))}
            style={{ ...btnGhost, marginTop: 8 }}
          >
            + Add another person
          </button>
        </div>
      )}

      {step === "documents" && compliance && (
        <ComplianceDocuments
          venueId={venue.id}
          compliance={compliance}
          onUploaded={() => refetchStatus()}
        />
      )}

      {step === "review" && (
        <div style={{ ...card, padding: 28, marginBottom: 22 }}>
          <h3 style={sectionTitle}>Review</h3>
          {(compliance?.outstanding.length ?? 0) === 0 ? (
            <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>
              Everything Pinch asked for has been supplied. There is nothing more for you to do —
              we&rsquo;ll email you when the review is finished, and this page will update on its own.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6, margin: "0 0 14px" }}>
                Pinch can&rsquo;t finish the review until these are supplied:
              </p>
              <ul style={{ margin: "0 0 18px", paddingLeft: 18, fontSize: 14, lineHeight: 1.9 }}>
                {compliance!.outstanding.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <button type="button" onClick={() => setStep("documents")} style={btnGhost}>
                Back to documents
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Nav ────────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {stepIndex > 0 && (
          <button
            type="button"
            onClick={() => setStep(STEPS[stepIndex - 1].key)}
            style={btnGhost}
            disabled={saving}
          >
            Back
          </button>
        )}
        {!created && (
          <button
            type="button"
            onClick={goNext}
            disabled={saving}
            style={{ ...btnPrimary, opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}
          >
            {saving
              ? "Saving…"
              : step === "people"
                ? "Create account & continue"
                : "Save & continue"}
          </button>
        )}
        {created && step === "documents" && (
          <button type="button" onClick={() => setStep("review")} style={btnPrimary}>
            Review
          </button>
        )}
      </div>
    </div>
  );
}
