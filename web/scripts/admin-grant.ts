// Makes an existing account an approved admin. The person must have signed
// in once (so their auth user exists). Usage: bun run admin:grant you@gmail.com
import postgres from "postgres";

const email = process.argv[2];
if (!email) {
  console.error("Usage: bun run admin:grant <email>");
  process.exit(1);
}
const url = process.env.DIRECT_URL;
if (!url) {
  console.error("DIRECT_URL is not set. See .env.example.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });
try {
  const rows = await sql`
    update public.user_approvals a
    set status = 'approved', is_admin = true, decided_at = coalesce(a.decided_at, now()), decided_by = a.user_id
    from auth.users u
    where u.id = a.user_id and lower(u.email) = lower(${email})
    returning a.user_id`;
  if (rows.length === 0) {
    console.error(`No account for ${email}. Sign in with Google once, then run this again.`);
    process.exitCode = 1;
  } else {
    console.log(`${email} is now an approved admin.`);
  }
} finally {
  await sql.end();
}
