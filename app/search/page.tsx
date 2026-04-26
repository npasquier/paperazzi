// app/search/page.tsx
import PaperazziApp from '@/components/PaperazziApp';
import OnboardingOverlay from '@/components/OnboardingOverlay';

export default function SearchPage() {
  return (
    <div className='relative h-full min-h-0 overflow-hidden'>
      <OnboardingOverlay />
      <PaperazziApp />
    </div>
  );
}
