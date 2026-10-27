import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const secret = process.env.NEXTAUTH_SECRET;
const prisma = new PrismaClient();
const tag = `idor-${Date.now()}`;

async function makeUser(label) {
  const user = await prisma.user.create({
    data: { email: `${label}-${tag}@example.test`, name: label },
  });
  const team = await prisma.team.create({
    data: { name: `Team ${label} ${tag}` },
  });
  await prisma.userTeam.create({
    data: { userId: user.id, teamId: team.id, role: "ADMIN" },
  });
  const jwt = await encode({
    secret,
    token: { sub: user.id, email: user.email, user },
  });
  return { user, team, cookie: `next-auth.session-token=${jwt}` };
}

async function call(method, path, cookie, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { cookie, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, text: await res.text() };
}

const results = [];
function check(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${ok ? "" : ` (${detail})`}`);
  results.push(ok);
}

const a = await makeUser("a");
const b = await makeUser("b");
const doc = await prisma.document.create({
  data: { name: `secret-${tag}.pdf`, file: "ci/secret.pdf", teamId: a.team.id },
});
const folder = await prisma.folder.create({
  data: { name: `secret-folder-${tag}`, path: `/secret-${tag}`, teamId: a.team.id },
});
const dataroomB = await prisma.dataroom.create({
  data: { pId: `dr_${tag}`, name: `Room b ${tag}`, teamId: b.team.id },
});
const folderNow = () => prisma.folder.findUnique({ where: { id: folder.id } });
const foldersInRoomB = () =>
  prisma.dataroomFolder.count({ where: { dataroomId: dataroomB.id } });

// Documents
const docPath = `/api/teams/${a.team.id}/documents/${doc.id}`;
const own = await call("GET", docPath, a.cookie);
check(
  "owner can read their own document (control)",
  own.status === 200 && own.text.includes(doc.name),
  `status ${own.status}`,
);
const other = await call("GET", docPath, b.cookie);
check(
  "a user from another team cannot read it",
  other.status !== 200 && !other.text.includes(doc.name),
  `status ${other.status}`,
);
const mixed = await call(
  "GET",
  `/api/teams/${b.team.id}/documents/${doc.id}`,
  b.cookie,
);
check(
  "own team id + someone else's document id returns nothing",
  !mixed.text.includes(doc.name),
  `status ${mixed.status}`,
);
const anon = await call("GET", docPath, "");
check("no login is rejected", anon.status === 401, `status ${anon.status}`);

// Folders (the four endpoints from issue #2078)
const delOther = await call(
  "DELETE",
  `/api/teams/${a.team.id}/folders/manage/${folder.id}`,
  b.cookie,
);
check(
  "delete: another team's user cannot delete the folder",
  delOther.status !== 200 && (await folderNow()) !== null,
  `status ${delOther.status}`,
);
const delMixed = await call(
  "DELETE",
  `/api/teams/${b.team.id}/folders/manage/${folder.id}`,
  b.cookie,
);
check(
  "delete: own team id + someone else's folder id deletes nothing",
  (await folderNow()) !== null,
  `status ${delMixed.status}`,
);
const renameMixed = await call(
  "PUT",
  `/api/teams/${b.team.id}/folders/manage`,
  b.cookie,
  { folderId: folder.id, name: "pwned" },
);
check(
  "rename: another team's folder keeps its name",
  (await folderNow())?.name === `secret-folder-${tag}`,
  `status ${renameMixed.status}`,
);
const addMixed = await call(
  "POST",
  `/api/teams/${b.team.id}/folders/manage/${folder.id}/add-to-dataroom`,
  b.cookie,
  { dataroomId: dataroomB.id },
);
check(
  "add-to-dataroom: nothing is copied from another team's folder",
  addMixed.status !== 200 && (await foldersInRoomB()) === 0,
  `status ${addMixed.status}`,
);
const renameOwn = await call(
  "PUT",
  `/api/teams/${a.team.id}/folders/manage`,
  a.cookie,
  { folderId: folder.id, name: `renamed-${tag}` },
);
check(
  "rename: owner can rename their own folder (control)",
  renameOwn.status === 200 && (await folderNow())?.name === `renamed-${tag}`,
  `status ${renameOwn.status}`,
);

await prisma.$disconnect();
process.exit(results.includes(false) ? 1 : 0);
