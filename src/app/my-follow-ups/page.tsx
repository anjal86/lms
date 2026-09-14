import { redirect } from 'next/navigation';

export default function MyFollowUpsRedirectPage() {
  redirect('/work?type=follow_up&owner=me');
}
