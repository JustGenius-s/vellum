import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ConfirmationRequest {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
}

interface PendingConfirmation extends ConfirmationRequest {
  resolve(confirmed: boolean): void;
}

const ConfirmationContext = createContext<
  ((request: ConfirmationRequest) => Promise<boolean>) | null
>(null);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);

  const confirm = useCallback(
    (request: ConfirmationRequest) =>
      new Promise<boolean>((resolve) => {
        setPending((current) => {
          current?.resolve(false);
          return { ...request, resolve };
        });
      }),
    [],
  );

  const settle = useCallback((confirmed: boolean) => {
    setPending((current) => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmationContext.Provider value={value}>
      {children}
      <AlertDialog open={Boolean(pending)} onOpenChange={(open) => !open && settle(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
            <AlertDialogDescription>{pending?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={pending?.destructive ? "destructive" : "default"}
              onClick={() => settle(true)}
            >
              {pending?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmationContext.Provider>
  );
}

export function useConfirmation() {
  const confirm = useContext(ConfirmationContext);
  if (!confirm) throw new Error("ConfirmationProvider is missing");
  return confirm;
}
