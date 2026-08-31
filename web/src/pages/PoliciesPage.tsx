import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { SECTIONS, PREAMBLE, LAST_REVIEWED } from '@/content/dataPolicy';

// The public data policy. Deliberately reachable WITHOUT signing in — a
// parent deciding whether to let their kid use this, or an athletic
// director evaluating it, should not have to make an account to read what
// we do with student data. That is also why the marketing site links here
// rather than keeping its own copy: two copies drift, and a district's
// counsel notices when the website and the app disagree.
//
// Content comes from src/content/dataPolicy.ts so this file stays
// presentation only.

const PoliciesPage: React.FC = () => (
  <div className="mx-auto max-w-3xl px-4 py-10">
    <Button variant="ghost" size="sm" asChild className="mb-6">
      <Link to="/">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Link>
    </Button>

    <div className="mb-8 space-y-3">
      <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
        <ShieldCheck className="h-7 w-7" />
        Your data, and what we do with it
      </h1>
      <p className="text-muted-foreground">{PREAMBLE}</p>
      <p className="text-xs text-muted-foreground">Last reviewed {LAST_REVIEWED}.</p>
    </div>

    <div className="space-y-6">
      {SECTIONS.map((section) => (
        <Card key={section.id} id={section.id}>
          <CardHeader>
            <CardTitle className="text-xl">{section.heading}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {section.body.map((paragraph, i) => (
              <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>

    <Card className="mt-8">
      <CardHeader>
        <CardTitle className="text-xl">Schools and districts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          If your district requires a signed data privacy agreement before staff can use a service
          like this, we will sign one. We can work from your district’s own form or from the
          standard National Data Privacy Agreement.
        </p>
        <p>
          We can also provide, on request, a full inventory of every category of student data
          LeadPack stores. That inventory is generated from the software itself, so it cannot fall
          out of date with what the product actually does.
        </p>
        <p>Ask us at connect@jaredvallejo.com.</p>
      </CardContent>
    </Card>
  </div>
);

export default PoliciesPage;
