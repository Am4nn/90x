import { z } from "zod";
import { mockView } from "@/lib/coach/mocks";
import { MockHeader } from "./mock-header";

/** The mock header for a coach thread of kind mock; renders nothing for a ref that isn't the viewer's mock. */
export async function MockThreadHeader({ userId, mockId }: { userId: string; mockId: string }) {
  const id = z.uuid().safeParse(mockId);
  const mock = id.success ? await mockView(userId, id.data) : null;
  if (!mock) return null;
  return <MockHeader mockId={mock.id} type={mock.type} topic={mock.topic} startedAt={mock.startedAt} running={mock.status === "running"} />;
}
