import fs from 'node:fs';

const routePath = 'src/app/api/conversations/[id]/collaborators/route.ts';
let route = fs.readFileSync(routePath, 'utf8');

const oldPermissionBlock = `\n  if (parsed.data.user_id !== actor.user.id && !(await canManageOtherCollaborators(actor))) {\n    return NextResponse.json({ error: 'You do not have permission to add another staff member as a collaborator.' }, { status: 403 });\n  }\n`;
if (!route.includes(oldPermissionBlock)) throw new Error('POST collaborator permission block not found');
route = route.replace(oldPermissionBlock, '\n');
fs.writeFileSync(routePath, route);

const inboxPath = 'src/components/inbox/StableInbox.tsx';
let inbox = fs.readFileSync(inboxPath, 'utf8');

const oldAvailable = `  const canManageCollaborators = can('inbox.assign');\n  const availableCollaborators = allProfiles.filter((profile) =>\n    profile.is_active\n    && !collaborators.some((row) => row.user_id === profile.id)\n    && (canManageCollaborators || profile.id === currentUser?.id)\n  );`;
const newAvailable = `  const canManageCollaborators = can('inbox.assign');\n  const availableCollaborators = allProfiles.filter((profile) =>\n    profile.is_active\n    && !collaborators.some((row) => row.user_id === profile.id)\n  );`;
if (!inbox.includes(oldAvailable)) throw new Error('available collaborator filter not found');
inbox = inbox.replace(oldAvailable, newAvailable);
fs.writeFileSync(inboxPath, inbox);
