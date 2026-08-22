import { useState } from 'react';
import { Link } from 'react-router';
import { useRegister } from '../api/hooks';
import { Button, Card, ErrorNote, TextInput } from '../components/ui';

export default function Register() {
  const register = useRegister();
  const [form, setForm] = useState({
    inviteCode: '',
    username: '',
    displayName: '',
    phone: '',
    password: '',
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <div className="text-6xl">🎟️</div>
        <h1 className="font-display mt-3 text-3xl font-extrabold text-grass-300">הצטרפות לליגה</h1>
        <p className="mt-1 text-sm text-ink-dim">צריך את קוד הכניסה מהחברים</p>
      </div>

      <Card>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            register.mutate({
              inviteCode: form.inviteCode.trim(),
              username: form.username.trim(),
              displayName: form.displayName.trim(),
              phone: form.phone.trim(),
              password: form.password,
            });
          }}
        >
          <TextInput
            label="קוד כניסה לליגה"
            dir="ltr"
            autoCapitalize="characters"
            value={form.inviteCode}
            onChange={set('inviteCode')}
            required
          />
          <TextInput
            label="שם משתמש (באנגלית, לכניסה)"
            dir="ltr"
            autoCapitalize="none"
            autoComplete="username"
            value={form.username}
            onChange={set('username')}
            required
          />
          <TextInput
            label="שם תצוגה (מה שכולם יראו)"
            value={form.displayName}
            onChange={set('displayName')}
            required
          />
          <TextInput
            label="מספר נייד"
            type="tel"
            dir="ltr"
            autoComplete="tel"
            placeholder="050-0000000"
            value={form.phone}
            onChange={set('phone')}
            required
          />
          <TextInput
            label="סיסמה (לפחות 6 תווים)"
            type="password"
            dir="ltr"
            autoComplete="new-password"
            value={form.password}
            onChange={set('password')}
            required
          />
          <ErrorNote message={register.isError ? register.error.message : null} />
          <Button type="submit" disabled={register.isPending}>
            {register.isPending ? 'רגע…' : 'יאללה, תכניסו אותי ⚽'}
          </Button>
        </form>
      </Card>

      <p className="text-center text-sm text-ink-dim">
        כבר רשום?{' '}
        <Link to="/" className="font-bold text-grass-300 underline">
          כניסה
        </Link>
      </p>
    </div>
  );
}
