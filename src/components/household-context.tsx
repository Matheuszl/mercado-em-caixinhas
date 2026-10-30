import { createContext, useContext } from "react";
import type { HouseholdMembership } from "@/lib/household";

export const HouseholdContext = createContext<HouseholdMembership | null>(null);

export function useHousehold(): HouseholdMembership {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error("useHousehold must be used inside the app shell");
  return ctx;
}
