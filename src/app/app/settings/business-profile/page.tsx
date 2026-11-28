import { PageHeader } from "@/components/ui";
import { BusinessProfileManager } from "@/components/business-profile-form";

export const dynamic = "force-dynamic";

export default function BusinessProfileSettingsPage() {
  return (
    <>
      <PageHeader title="Business profile" subtitle="Edit your business information, offerings and discovered facts." />
      <BusinessProfileManager />
    </>
  );
}
