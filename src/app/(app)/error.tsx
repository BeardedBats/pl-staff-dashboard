"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/state";

export default function AppError({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      title="This page could not be loaded"
      description="Your data was not changed. Try loading this page again."
      action={
        <Button onClick={reset}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      }
    />
  );
}
