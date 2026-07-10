import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Settings } from "@/lib/models";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 앱 전역 설정(과목·클리닉 날짜). 로그인한 모든 사용자가 조회.
export async function GET() {
  const g = await requireUser();
  if (!g.ok) return g.res;

  await dbConnect();
  const settings = await Settings.findOne({ key: "app" }).lean();

  return NextResponse.json({
    subjects: settings?.subjects ?? ["수학"],
    clinicDates: (settings?.clinicDates ?? []).slice().sort(),
  });
}
