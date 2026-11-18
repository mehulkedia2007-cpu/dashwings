import { redirect } from 'next/navigation';

// shortcut: home sends visitors to the debug page until the real landing page (Phase 3+) exists.
export default function Home() {
  redirect('/debug');
}
