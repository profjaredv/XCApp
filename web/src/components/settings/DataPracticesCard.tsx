import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink } from 'lucide-react';
import { trainingLogService } from '@/api/trainingLogService';

// The student-data inventory, generated from the server's classification
// registry rather than written here.
//
// This is what a district asks for during procurement — "list every
// category of student data you hold" — and the reason it is generated is
// that a hand-maintained list is wrong within two releases. The backend
// test asserts every table in the schema appears in the registry, so this
// card cannot silently omit a category that exists.

const CLASS_LABELS: Record<string, { title: string; blurb: string }> = {
  DIRECTORY: {
    title: 'Publishable by the school',
    blurb:
      'Directory information under 34 CFR § 99.3 — names, grade level, participation and results in a school sport. The same fields already public on meet results sites. Your school controls whether it may be published, and families can opt out through the school.',
  },
  EDUCATION_RECORD: {
    title: 'Protected school records',
    blurb:
      'Student data created by the school or the coach’s work. Never public, never shown outside the team, and handled as education records.',
  },
  ATHLETE_AUTHORED: {
    title: 'The athlete’s own writing',
    blurb:
      'Written by the athlete about herself. Private to her unless she chooses to share it, and hers to delete.',
  },
  OPERATIONAL: {
    title: 'Not about students',
    blurb: 'Accounts, billing, team settings and product telemetry. No student appears in these.',
  },
};

const ORDER = ['ATHLETE_AUTHORED', 'EDUCATION_RECORD', 'DIRECTORY', 'OPERATIONAL'];

export const DataPracticesCard: React.FC = () => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dataPractices'],
    queryFn: () => trainingLogService.getDataPractices(),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Every category of data LeadPack stores for your team, and how each one is treated.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link to="/policies">
            Read the full policy
            <ExternalLink className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {isError && (
        <p className="text-sm text-muted-foreground">
          Could not load the data inventory right now.
        </p>
      )}

      {data &&
        ORDER.filter((key) => (data.classes[key]?.length ?? 0) > 0).map((key) => {
          const label = CLASS_LABELS[key];
          const entries = data.classes[key];
          return (
            <div key={key} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-semibold">{label.title}</h4>
                <Badge variant="secondary">{entries.length}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{label.blurb}</p>
              <ul className="mt-3 space-y-2">
                {entries.map((entry) => (
                  <li key={entry.model} className="text-sm">
                    <span className="font-medium">{entry.what}</span>{' '}
                    <span className="text-muted-foreground">{entry.why}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
    </div>
  );
};

export default DataPracticesCard;
