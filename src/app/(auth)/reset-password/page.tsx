'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

function ResetPasswordContent() {
  const params = useSearchParams();
  const token = params.get('token');

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center text-slate-400">
          <p>Lien invalide ou manquant.</p>
          <a href="/forgot-password" className="text-cyan-400 hover:underline mt-2 block">
            Demander un nouveau lien
          </a>
        </div>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}
