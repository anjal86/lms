import { redirect } from 'next/navigation';

export default function FollowUpsRedirectPage() {
  redirect('/work?type=follow_up');
}
