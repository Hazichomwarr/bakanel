import { publicRobotsText } from "@/lib/public/robots";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  return new Response(publicRobotsText(), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
