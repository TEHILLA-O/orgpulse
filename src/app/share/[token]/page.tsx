import { PublicChart } from '@/components/chart/public-chart';

export const metadata = {
  title: 'Shared org chart · Omni org chart',
  robots: { index: false, follow: false },
};

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="h-screen">
      <PublicChart token={token} />
    </div>
  );
}
