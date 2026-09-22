import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { redis } from "@/lib/queue";

export async function GET(){
  const checks:{database:boolean;redis:boolean}={database:false,redis:false};
  try{await pool.query("SELECT 1");checks.database=true;}catch{}
  try{checks.redis=(await redis().ping())==="PONG";}catch{}
  const ok=checks.database&&checks.redis;
  return NextResponse.json({status:ok?"ok":"degraded",checks},{status:ok?200:503});
}
