// app/search/page.tsx
import PaperazziApp from '@/components/PaperazziApp';
import OnboardingOverlay from '@/components/OnboardingOverlay';

export default function SearchPage() {
  return (
    <>
      <OnboardingOverlay />
      <PaperazziApp />
    </>
  );
}