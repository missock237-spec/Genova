import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Connexion — Genova AI OS',
};

export default function TestLoginPage() {
  return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
    <h1>Login Page Works</h1>
  </div>;
}
