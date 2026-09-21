import { PublicChart } from '@/components/chart/public-chart';

export const metadata = {
  title: 'Embedded org chart · Omni org chart',
  robots: { index: false, follow: false },
};

export default async function EmbedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="h-screen">
      <PublicChart token={token} embed />
    </div>
  );
}
