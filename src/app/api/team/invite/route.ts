import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { invalidateRedisCache } from '@/lib/redis/cache';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const InviteSchema = z.object({
  email: z.string().trim().email().max(254),
  full_name: z.string().trim().min(2).max(160),
  role: z.enum(['admin', 'manager', 'agent']).default('agent'),
  phone: z.string().trim().max(40).optional(),
  direct_extension: z.string().trim().max(40).optional(),
  avatar_url: z.string().url().max(1000).optional(),
  destination_tags: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  max_capacity: z.number().int().min(1).max(500).default(25),
  accepting_leads: z.boolean().default(true),
  bio: z.string().trim().max(2000).optional(),
  languages: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  office_location: z.string().trim().max(200).optional(),
  certifications: z.array(z.string().trim().min(1).max(160)).max(50).default([]),
});

type InviteInput = z.infer<typeof InviteSchema>;

function compatibilityRole(role: InviteInput['role']) {
  return role;
}

async function provisionMembershipForExistingUser(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  input: InviteInput,
  profile: any,
  workspaceId: string,
  invitedBy: string
) {
  const { data: existingMembership, error: membershipReadError } = await admin
    .from('workspace_members')
    .select('workspace_id,user_id,role,is_active')
    .eq('workspace_id', workspaceId)
    .eq('user_id', profile.id)
    .maybeSingle();

  if (membershipReadError) throw membershipReadError;
  if (existingMembership?.is_active) {
    return { conflict: true as const, profile, role: existingMembership.role };
  }

  if (existingMembership) {
    const { error } = await admin
      .from('workspace_members')
      .update({ role: input.role, is_active: true, invited_by: invitedBy, joined_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)
      .eq('user_id', profile.id);
    if (error) throw error;
  } else {
    const { error } = await admin.from('workspace_members').insert({
      workspace_id: workspaceId,
      user_id: profile.id,
      role: input.role,
      is_active: true,
      invited_by: invitedBy,
      joined_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  const profilePatch: Record<string, unknown> = {
    full_name: input.full_name,
    phone: input.phone || profile.phone || null,
    direct_extension: input.direct_extension || profile.direct_extension || null,
    avatar_url: input.avatar_url || profile.avatar_url || null,
    destination_tags: input.destination_tags,
    max_capacity: input.max_capacity,
    accepting_leads: input.role === 'agent' ? input.accepting_leads : false,
    bio: input.bio || profile.bio || null,
    languages: input.languages,
    office_location: input.office_location || profile.office_location || null,
    certifications: input.certifications,
  };

  // An existing user's active company is their own preference. Only set the active
  // workspace when they currently have none; never steal them from another client.
  if (!profile.workspace_id) {
    profilePatch.workspace_id = workspaceId;
    profilePatch.role = compatibilityRole(input.role);
  }

  const { data: updatedProfile, error: profileError } = await admin
    .from('profiles')
    .update(profilePatch)
    .eq('id', profile.id)
    .select('*')
    .single();
  if (profileError) throw profileError;

  return { conflict: false as const, profile: updatedProfile, role: input.role };
}

export async function POST(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) {
    return NextResponse.json({ error: 'Only workspace managers can invite team members.' }, { status: 403 });
  }

  const parsed = InviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed.', fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const input = parsed.data;
  if (actor.profile.workspace_role === 'manager' && input.role !== 'agent') {
    return NextResponse.json({ error: 'Managers may only invite agents.' }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const workspaceId = actor.profile.workspace_id;
  const email = input.email.toLowerCase();

  try {
    const { data: existingProfile, error: existingProfileError } = await admin
      .from('profiles')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    if (existingProfileError) throw existingProfileError;

    if (existingProfile) {
      const result = await provisionMembershipForExistingUser(
        admin,
        input,
        existingProfile,
        workspaceId,
        actor.user.id
      );
      if (result.conflict) {
        return NextResponse.json({ error: 'This person is already a member of the workspace.' }, { status: 409 });
      }
      await invalidateRedisCache({ workspaceId, namespace: 'team:members' });
      return NextResponse.json({ profile: result.profile, workspace_role: result.role, membershipCreated: true }, { status: 201 });
    }

    const { data: existingInvite, error: inviteReadError } = await admin
      .from('workspace_invitations')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
      .ilike('email', email)
      .maybeSingle();
    if (inviteReadError) throw inviteReadError;

    let invitationId = existingInvite?.id as string | undefined;
    if (invitationId) {
      const { error } = await admin
        .from('workspace_invitations')
        .update({
          email,
          role: input.role,
          invited_by: actor.user.id,
          expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', invitationId);
      if (error) throw error;
    } else {
      const { data: invitation, error } = await admin
        .from('workspace_invitations')
        .insert({ workspace_id: workspaceId, email, role: input.role, invited_by: actor.user.id })
        .select('id')
        .single();
      if (error) throw error;
      invitationId = invitation.id;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${appUrl}/auth/callback?next=/dashboard`,
      data: { full_name: input.full_name },
    });

    if (inviteError || !invite.user) {
      if (invitationId) {
        await admin
          .from('workspace_invitations')
          .update({ status: 'revoked', updated_at: new Date().toISOString() })
          .eq('id', invitationId);
      }

      // Handle an account created between the profile lookup and the invite call.
      const { data: racedProfile } = await admin
        .from('profiles')
        .select('*')
        .eq('email', email)
        .maybeSingle();
      if (racedProfile) {
        const result = await provisionMembershipForExistingUser(
          admin,
          input,
          racedProfile,
          workspaceId,
          actor.user.id
        );
        if (result.conflict) {
          return NextResponse.json({ error: 'This person is already a member of the workspace.' }, { status: 409 });
        }
        await invalidateRedisCache({ workspaceId, namespace: 'team:members' });
      return NextResponse.json({ profile: result.profile, workspace_role: result.role, membershipCreated: true }, { status: 201 });
      }

      console.error('Workspace invitation failed:', inviteError?.message);
      return NextResponse.json({ error: 'Unable to send the workspace invitation.' }, { status: 500 });
    }

    // The auth trigger creates the profile and migration 058 claims the invitation.
    // Apply neutral CRM profile details without changing the membership role.
    const employeeCode = `CRM-${input.role === 'admin' ? 'ADM' : input.role === 'manager' ? 'MGR' : 'AGT'}-${invite.user.id.slice(0, 8).toUpperCase()}`;
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .update({
        full_name: input.full_name,
        employee_code: employeeCode,
        phone: input.phone || null,
        direct_extension: input.direct_extension || null,
        avatar_url: input.avatar_url || null,
        destination_tags: input.destination_tags,
        max_capacity: input.max_capacity,
        status: 'offline',
        is_active: true,
        accepting_leads: input.role === 'agent' ? input.accepting_leads : false,
        bio: input.bio || null,
        languages: input.languages,
        office_location: input.office_location || null,
        certifications: input.certifications,
      })
      .eq('id', invite.user.id)
      .select('*')
      .single();

    if (profileError) {
      console.error('Invited user profile provisioning failed:', profileError.message);
      return NextResponse.json({ error: 'Invitation was sent, but profile setup needs attention.' }, { status: 500 });
    }

    await invalidateRedisCache({ workspaceId, namespace: 'team:members' });
    return NextResponse.json({ profile, workspace_role: input.role, invitationId }, { status: 201 });
  } catch (error) {
    console.error('Workspace invitation failed:', error);
    return NextResponse.json({ error: 'Unable to invite team member.' }, { status: 500 });
  }
}
