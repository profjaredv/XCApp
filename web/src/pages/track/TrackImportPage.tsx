import React, { useState } from 'react';
import { Upload } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { BrowserEventProgressImportPanel } from '@/components/track/BrowserEventProgressImportPanel';
import { useTrackSeasons } from './trackShared';

// Track & Field setup. A track season starts here: there is nothing to
// create first, importing a year's results is what makes the season exist.
const TrackImportPage: React.FC = () => {
  const { data: seasons } = useTrackSeasons();
  const [year, setYear] = useState(String(new Date().getFullYear()));

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <PageHeader
        section="neutral"
        icon={Upload}
        title="Import results"
        description="Bring a track and field season in from Athletic.net. Importing a year again updates it; nothing is deleted."
      />
      {seasons && seasons.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Imported so far: {seasons.map((s) => `${s.year} (${s.resultCount} results, ${s.meetCount} meets)`).join(', ')}.
        </p>
      )}
      <div className="flex items-center gap-2 text-sm">
        <label htmlFor="track-import-year" className="font-medium">
          Season to import
        </label>
        <Input id="track-import-year" type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-28" />
      </div>
      <BrowserEventProgressImportPanel season={year} onComplete={() => undefined} />
    </div>
  );
};

export default TrackImportPage;
