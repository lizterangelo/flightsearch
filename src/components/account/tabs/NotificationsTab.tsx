"use client";

import { useMe } from "@/components/auth/MeProvider";
import { Row, Section, Toggle } from "../primitives";

/** Notifications: iMessage + Email toggle groups. */
export default function NotificationsTab() {
  const { profile, updateProfile } = useMe();
  if (!profile) return null;

  return (
    <>
      <Section label="iMessage">
        <Row
          title="Flight Alerts"
          sub="Delays, time changes, gates, and destination updates."
          right={
            <Toggle
              label="Flight alerts"
              checked={profile.notif_flight_alerts}
              onChange={(v) => void updateProfile({ notif_flight_alerts: v })}
            />
          }
        />
        <Row
          title="Watched flights"
          sub="Price changes for flights and routes you're watching."
          right={
            <Toggle
              label="Watched flights"
              checked={profile.notif_watched}
              onChange={(v) => void updateProfile({ notif_watched: v })}
            />
          }
          last
        />
      </Section>

      <Section label="Email">
        <Row
          title="Check-in emails"
          sub="Get alerted 24 hours before your flight to check in."
          right={
            <Toggle
              label="Check-in emails"
              checked={profile.notif_checkin}
              onChange={(v) => void updateProfile({ notif_checkin: v })}
            />
          }
        />
        <Row
          title="Marketing emails"
          sub="Product news, offers, and travel tips. We never share your email."
          right={
            <Toggle
              label="Marketing emails"
              checked={profile.notif_marketing}
              onChange={(v) => void updateProfile({ notif_marketing: v })}
            />
          }
          last
        />
      </Section>
    </>
  );
}
