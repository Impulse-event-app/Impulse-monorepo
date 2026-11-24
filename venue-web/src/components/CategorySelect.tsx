"use client";

import React, { useState } from "react";
import { CATEGORIES, OTHER, isStandardCategory } from "@/lib/categories";

/**
 * A category dropdown. Picking "Other" shows a text box, and what the venue
 * types there becomes the category. A saved category that isn't one of the
 * standard options opens as "Other" with that text filled in.
 */
export function CategorySelect({
  value, onChange, selectStyle, inputStyle,
}: {
  value: string;
  onChange: (value: string) => void;
  selectStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;
}) {
  const [other, setOther] = useState(!isStandardCategory(value));
  const typed = other && value !== OTHER ? value : "";

  return (
    <>
      <select
        value={other ? OTHER : value}
        onChange={(e) => {
          const picked = e.target.value;
          setOther(picked === OTHER);
          onChange(picked === OTHER ? "" : picked);
        }}
        style={selectStyle}
      >
        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
      </select>
      {other && (
        <input
          value={typed}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type of venue, e.g. Pottery studio"
          aria-label="Type of venue"
          maxLength={40}
          style={{ ...inputStyle, marginTop: 8 }}
        />
      )}
    </>
  );
}
