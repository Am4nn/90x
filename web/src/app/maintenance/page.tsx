import type { Metadata } from "next";
import { connection } from "next/server";
import { MaintenanceView } from "@/components/maintenance/maintenance-view";
import { maintenanceState } from "@/lib/maintenance/flag";
import { breakGlass } from "@/lib/maintenance/rules";

export const metadata: Metadata = { title: "Down for maintenance", robots: { index: false } };

// Every blocked page is rewritten here by the proxy (src/proxy.ts), which sets the 503. Rendered per
// request so the admin's message is current. Under the break-glass nothing is read: the page must
// render with the database and Redis out of reach.
export default async function MaintenancePage() {
  await connection();
  if (breakGlass()) return <MaintenanceView message={null} signIn={false} />;
  const state = await maintenanceState();
  return <MaintenanceView message={state.on ? state.message : null} signIn />;
}
