"use client";

import { useMe } from "@/components/auth/MeProvider";
import { EditableRow, Section } from "../primitives";

/** Details: legal/travel identity used to prefill bookings. */
export default function DetailsTab() {
  const { profile, updateProfile } = useMe();
  if (!profile) return null;

  return (
    <Section label="Personal information">
      <EditableRow
        title="Name"
        value={profile.legal_name}
        onSave={(v) => updateProfile({ legal_name: v || null })}
      />
      <EditableRow
        title="Date of birth"
        value={profile.born_on}
        type="date"
        onSave={(v) => updateProfile({ born_on: v || null })}
      />
      <EditableRow
        title="Passport number"
        value={profile.passport_number}
        onSave={(v) => updateProfile({ passport_number: v || null })}
      />
      <EditableRow
        title="Passport country"
        value={profile.passport_country}
        placeholder="— (2-letter code)"
        onSave={(v) =>
          updateProfile({
            passport_country: v ? v.toUpperCase().slice(0, 2) : null,
          })
        }
      />
      <EditableRow
        title="Passport expiry"
        value={profile.passport_expiry}
        type="date"
        onSave={(v) => updateProfile({ passport_expiry: v || null })}
      />
      <EditableRow
        title="Known traveler number"
        value={profile.known_traveler_number}
        last
        onSave={(v) => updateProfile({ known_traveler_number: v || null })}
      />
    </Section>
  );
}
