import { useState } from 'react';
import { Link } from 'react-router';
import { useLogin } from '../api/hooks';
import { Button, Card, ErrorNote, TextInput } from '../components/ui';
import { EphemeralNotice } from '../components/EphemeralNotice';

export default function Login() {
  const login = useLogin();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <div className="text-7xl">⚽</div>
        <h1 className="font-display mt-3 text-4xl font-extrabold text-grass-300">0 מושג בכדורגל</h1>
        <p className="mt-1 text-ink-dim">ליגת הניחושים של החברים</p>
      </div>

      <EphemeralNotice />

      <Card>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate({ username: username.trim(), password });
          }}
        >
          <TextInput
            label="שם משתמש"
            autoComplete="username"
            autoCapitalize="none"
            dir="ltr"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <TextInput
            label="סיסמה"
            type="password"
            autoComplete="current-password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <ErrorNote message={login.isError ? login.error.message : null} />
          <Button type="submit" disabled={login.isPending}>
            {login.isPending ? 'רגע…' : 'כניסה למגרש 🟢'}
          </Button>
        </form>
      </Card>

      <p className="text-center text-sm text-ink-dim">
        עוד אין לך חשבון?{' '}
        <Link to="/register" className="font-bold text-grass-300 underline">
          הצטרפות לליגה
        </Link>
      </p>
      <p className="text-center text-xs text-ink-dim/70">
        שכחת סיסמה? דבר עם מנהל הליגה — הוא יאפס לך אותה.
      </p>
    </div>
  );
}
