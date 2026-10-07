import { MaintenanceBanner } from "@/components/maintenance/banner";
import { ReloadOnDown } from "@/components/maintenance/reload-on-down";
import { maintenanceState } from "@/lib/maintenance/flag";

// Every admin page shows the maintenance banner while the switch is on. Only admins get past the
// proxy's /admin lock, and each page still calls requireAdmin(), so this reads nothing private.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { on } = await maintenanceState();
  return (
    <>
      {on && <MaintenanceBanner />}
      {children}
      {/* The break-glass blocks admins too: an open admin tab reloads onto the maintenance page. */}
      <ReloadOnDown />
    </>
  );
}
