"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ConfirmationOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
};

type PendingConfirmation = ConfirmationOptions & {
  resolve: (confirmed: boolean) => void;
};

const ConfirmationContext = React.createContext<
  ((options: ConfirmationOptions) => Promise<boolean>) | null
>(null);

export function ConfirmationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [pending, setPending] = React.useState<PendingConfirmation | null>(null);

  const confirm = React.useCallback(
    (options: ConfirmationOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...options, resolve });
      }),
    [],
  );

  const finish = React.useCallback(
    (confirmed: boolean) => {
      if (!pending) return;
      setPending(null);
      pending.resolve(confirmed);
    },
    [pending],
  );

  return (
    <ConfirmationContext.Provider value={confirm}>
      {children}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) finish(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pending?.title}</DialogTitle>
            <DialogDescription>{pending?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => finish(false)}>
              Cancel
            </Button>
            <Button
              variant={pending?.destructive ? "destructive" : "default"}
              onClick={() => finish(true)}
            >
              {pending?.confirmLabel ?? "Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmationContext.Provider>
  );
}

export function useConfirmation() {
  const confirm = React.useContext(ConfirmationContext);
  if (!confirm) {
    throw new Error("useConfirmation must be used inside ConfirmationProvider");
  }
  return confirm;
}
