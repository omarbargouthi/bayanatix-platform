"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, AVATAR_COLOR_CODES } from "@/components/ui/Avatar";
import { initials } from "@/lib/utils";
import { useLang } from "@/lib/lang-context";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";

interface Props {
  fullName: string;
  email: string;
  role: string;
  userId: string;
  avatarColorCode: string | null;
  disabledNotificationTypes: string[];
}

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="card p-6">
      <h2 className="font-bold text-brand-deep mb-1">{title}</h2>
      {description && <p className="text-[13px] text-muted mb-4">{description}</p>}
      {!description && <div className="mb-4" />}
      {children}
    </div>
  );
}

export function ProfilePageClient({ fullName, email, role, userId, avatarColorCode, disabledNotificationTypes }: Props) {
  const router = useRouter();
  const { lang, setLang, languages, t } = useLang();
  const p = t.profile;

  // Avatar
  const [colorCode, setColorCode] = useState(avatarColorCode);
  const [savingColor, setSavingColor] = useState(false);

  async function pickColor(code: string | null) {
    setColorCode(code);
    setSavingColor(true);
    try {
      await fetch("/api/users/me/avatar-color", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ colorCode: code }),
      });
      router.refresh();
    } finally {
      setSavingColor(false);
    }
  }

  // Notification preferences
  const [disabled, setDisabled] = useState(new Set(disabledNotificationTypes));
  const [savingNotifs, setSavingNotifs] = useState(false);
  const [notifsSaved, setNotifsSaved] = useState(false);

  async function toggleType(code: string) {
    const next = new Set(disabled);
    if (next.has(code)) next.delete(code); else next.add(code);
    setDisabled(next);
    setSavingNotifs(true);
    setNotifsSaved(false);
    try {
      await fetch("/api/users/me/notification-preferences", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ disabledTypes: [...next] }),
      });
      setNotifsSaved(true);
    } finally {
      setSavingNotifs(false);
    }
  }

  // Change password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword,     setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError,   setPwError]   = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwSaving,  setPwSaving]  = useState(false);

  async function changePassword() {
    setPwError(null);
    setPwSuccess(false);
    if (newPassword !== confirmPassword) { setPwError(p.passwordMismatch); return; }
    if (newPassword.length < 8) { setPwError(p.passwordTooShort); return; }
    setPwSaving(true);
    try {
      const r = await fetch("/api/users/me/password", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: p.passwordChangeFailed }));
        setPwError(d.error ?? p.passwordChangeFailed);
        return;
      }
      setPwSuccess(true);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <main className="px-8 py-7 pb-14 max-w-3xl mx-auto space-y-6">
      {/* Profile card */}
      <div className="card p-6 flex items-center gap-6">
        <Avatar initials={initials(fullName)} seed={userId} colorCode={colorCode} size={72} />
        <div>
          <h1 className="text-2xl font-extrabold text-brand-deep">{fullName}</h1>
          <p className="text-sm text-muted">{email}</p>
          <span className="tag tag-purple mt-2 inline-block">{(t.roles as Record<string, string>)[role] ?? role}</span>
        </div>
      </div>

      {/* Pointer to Homepage for requests/activity */}
      <div className="rounded-lg border border-brand-purple/20 bg-brand-purple/5 px-5 py-3.5 flex items-center justify-between gap-4">
        <p className="text-[13px] text-ink-soft">
          {p.homepagePointer}
        </p>
        <Link href="/homepage" className="btn btn-sm shrink-0">{p.goToHomepage}</Link>
      </div>

      {/* Avatar */}
      <SectionCard title={p.avatarTitle} description={p.avatarDesc}>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => pickColor(null)}
            className={`w-9 h-9 rounded-full border-2 grid place-items-center text-[10px] font-bold text-muted ${!colorCode ? "border-brand-purple" : "border-line"}`}
            title={p.avatarAutoTitle}
          >
            {p.avatarAuto}
          </button>
          {AVATAR_COLOR_CODES.map((code) => (
            <button
              key={code}
              onClick={() => pickColor(code)}
              disabled={savingColor}
              className={`rounded-full border-2 p-0.5 ${colorCode === code ? "border-brand-purple" : "border-transparent"}`}
              title={code}
            >
              <Avatar initials="" seed={userId} colorCode={code} size={32} />
            </button>
          ))}
        </div>
      </SectionCard>

      {/* Preferences */}
      <SectionCard title={p.languageTitle}>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          className="input-field max-w-xs"
        >
          {languages.map((l) => (
            <option key={l.languageCode} value={l.languageCode}>{l.languageNameText}</option>
          ))}
        </select>
      </SectionCard>

      {/* Notification preferences */}
      <SectionCard title={p.notifPrefsTitle} description={p.notifPrefsDesc}>
        <div className="space-y-3">
          {NOTIFICATION_TYPES.map((n) => (
            <label key={n.code} className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={!disabled.has(n.code)}
                onChange={() => toggleType(n.code)}
                className="w-4 h-4 mt-0.5 rounded accent-brand-purple"
              />
              <div>
                <div className="text-sm font-medium text-ink">{p.notifTypes[n.code]}</div>
                <div className="text-[12px] text-muted">{p.notifTypeDescs[n.code]}</div>
              </div>
            </label>
          ))}
        </div>
        {savingNotifs && <p className="text-[11px] text-muted mt-3">{t.common.saving}</p>}
        {!savingNotifs && notifsSaved && <p className="text-[11px] text-emerald-600 mt-3">{p.saved}</p>}
      </SectionCard>

      {/* Change password */}
      <SectionCard title={p.changePassword}>
        <div className="space-y-3 max-w-sm">
          <div>
            <label className="field-label">{p.currentPassword}</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="field-label">{p.newPassword}</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="field-label">{p.confirmNewPassword}</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input-field" />
          </div>
          {pwError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{pwError}</p>}
          {pwSuccess && <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">{p.passwordUpdated}</p>}
          <button
            onClick={changePassword}
            disabled={pwSaving || !currentPassword || !newPassword || !confirmPassword}
            className="btn btn-primary"
          >
            {pwSaving ? t.common.saving : p.updatePassword}
          </button>
        </div>
      </SectionCard>
    </main>
  );
}
