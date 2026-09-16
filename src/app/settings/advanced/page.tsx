import { redirect } from 'next/navigation';

export default function AdvancedSettingsRedirectPage() {
  redirect('/settings/workspace/preferences');
}
