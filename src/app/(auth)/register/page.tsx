import type { Metadata } from 'next';
import { RegisterForm } from '@/components/auth/register-form';

export const metadata: Metadata = {
  title: 'Créer un compte — Genova AI OS',
  description: 'Rejoignez la plateforme Genova AI et créez vos premiers agents IA.',
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return <RegisterForm />;
}
