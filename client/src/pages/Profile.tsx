import { useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import type { UserPrivate } from '@league/shared';
import {
  useChangePassword,
  useLogout,
  useUpdateProfile,
  useUploadAvatar,
} from '../api/hooks';
import { Avatar } from '../components/Avatar';
import { Button, Card, ErrorNote, SectionTitle, TextInput } from '../components/ui';
import { NotificationsCard } from '../push/NotificationsCard';

export default function Profile() {
  const { me } = useOutletContext<{ me: UserPrivate }>();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const uploadAvatar = useUploadAvatar();
  const logout = useLogout();
  const fileInput = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(me.displayName);
  const [phone, setPhone] = useState(me.phone);
  const [passwords, setPasswords] = useState({ current: '', next: '' });
  const [passwordSaved, setPasswordSaved] = useState(false);

  return (
    <div className="flex flex-col gap-3 p-4">
      <Card className="flex flex-col items-center gap-2 py-6">
        <button type="button" className="relative" onClick={() => fileInput.current?.click()}>
          <Avatar user={me} size="xl" />
          <span className="absolute -bottom-1 -end-1 flex size-7 items-center justify-center rounded-full border border-line bg-card-raised text-sm">
            📷
          </span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadAvatar.mutate(file);
            e.target.value = '';
          }}
        />
        <div className="text-center">
          <div className="font-display text-xl font-extrabold">{me.displayName}</div>
          <div className="text-sm text-ink-dim" dir="ltr">
            @{me.username}
          </div>
        </div>
        {uploadAvatar.isPending && <span className="text-xs text-ink-dim">מעלה תמונה…</span>}
        <ErrorNote message={uploadAvatar.isError ? uploadAvatar.error.message : null} />
        <Link to={`/players/${me.id}`} className="text-sm font-bold text-grass-300 underline">
          לסטטיסטיקות שלי 📊
        </Link>
      </Card>

      <NotificationsCard />

      <SectionTitle>פרטים אישיים</SectionTitle>
      <Card>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            updateProfile.mutate({ displayName: displayName.trim(), phone: phone.trim() });
          }}
        >
          <TextInput label="שם תצוגה" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <TextInput label="מספר נייד" dir="ltr" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <ErrorNote message={updateProfile.isError ? updateProfile.error.message : null} />
          <Button type="submit" variant="ghost" disabled={updateProfile.isPending}>
            {updateProfile.isSuccess ? 'נשמר ✓' : 'שמירת פרטים'}
          </Button>
        </form>
      </Card>

      <SectionTitle>החלפת סיסמה</SectionTitle>
      <Card>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setPasswordSaved(false);
            changePassword.mutate(
              { currentPassword: passwords.current, newPassword: passwords.next },
              {
                onSuccess: () => {
                  setPasswords({ current: '', next: '' });
                  setPasswordSaved(true);
                },
              },
            );
          }}
        >
          <TextInput
            label="סיסמה נוכחית"
            type="password"
            dir="ltr"
            autoComplete="current-password"
            value={passwords.current}
            onChange={(e) => setPasswords((p) => ({ ...p, current: e.target.value }))}
            required
          />
          <TextInput
            label="סיסמה חדשה (לפחות 6 תווים)"
            type="password"
            dir="ltr"
            autoComplete="new-password"
            value={passwords.next}
            onChange={(e) => setPasswords((p) => ({ ...p, next: e.target.value }))}
            required
          />
          <ErrorNote message={changePassword.isError ? changePassword.error.message : null} />
          {passwordSaved && <p className="text-sm font-bold text-grass-300">הסיסמה הוחלפה ✓</p>}
          <Button type="submit" variant="ghost" disabled={changePassword.isPending}>
            החלפת סיסמה
          </Button>
        </form>
      </Card>

      {me.role === 'ADMIN' && (
        <Link
          to="/admin"
          className="block rounded-2xl border border-gold-400/40 bg-gold-400/10 py-3 text-center font-bold text-gold-300 active:scale-[0.98]"
        >
          🛠️ פאנל ניהול
        </Link>
      )}

      <Button variant="danger" className="mt-2" onClick={() => logout.mutate()}>
        התנתקות 👋
      </Button>
    </div>
  );
}
