import { redirect } from 'next/navigation';

export default function LegacyPhoneLeadsPage() {
  redirect('/inbox?view=has_phone');
}
