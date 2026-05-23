import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/api";

export async function getMobileUserEmail() {
  const cookieHeader = (await cookies()).toString();

  try {
    const user = await getMe({ cookie: cookieHeader });
    return user.email;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    if (message === "Not authenticated") {
      redirect("/mobile/login");
    }
    return null;
  }
}
