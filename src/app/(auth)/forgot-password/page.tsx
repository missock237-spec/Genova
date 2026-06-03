import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export const metadata: Metadata = {
  title: 'Mot de passe oublié — Genova AI OS',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
