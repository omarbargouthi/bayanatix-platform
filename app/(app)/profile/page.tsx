import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { findUserById } from "@/lib/queries/users";
import { ProfilePageClient } from "./ProfilePageClient";
import { getUserAccessProfile } from "@/lib/queries/user-access";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await findUserById(session.userId);
  if (!user) redirect("/login");
  const access = await getUserAccessProfile(session.userId);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanis", href: "/dashboard" },
          { label: "My Profile" },
        ]}
        user={session}
      />
      <ProfilePageClient
        fullName={user.full_name}
        email={user.email}
        role={user.role}
        userId={user.user_id}
        avatarColorCode={user.avatar_color_code}
        disabledNotificationTypes={user.disabled_notification_types}
        access={access}
      />
    </>
  );
}
