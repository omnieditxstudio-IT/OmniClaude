import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { organizationService } from '../services/organization.service';
import { teamService } from '../services/team.service';
import { Organization, Team, User } from '../models';
import { Types } from 'mongoose';

const CreateOrganizationSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  avatar: z.string().url().optional(),
  billingEmail: z.string().email().optional(),
});

const UpdateOrganizationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatar: z.string().url().optional(),
  billingEmail: z.string().email().optional(),
  settings: z.object({
    allowPublicSignUp: z.boolean().optional(),
    defaultTeamId: z.string().optional(),
    usageLimits: z.object({
      monthlyRequests: z.number().min(1).optional(),
      monthlyTokens: z.number().min(1).optional(),
      monthlyCostUsd: z.number().min(0.01).optional(),
    }).optional(),
    retentionDays: z.number().min(1).max(365).optional(),
  }).optional(),
});

const CreateTeamSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  settings: z.object({
    isPrivate: z.boolean().optional(),
    allowedModels: z.array(z.string()).optional(),
    allowedEndpoints: z.array(z.string()).optional(),
    budgetLimit: z.number().min(0).optional(),
  }).optional(),
});

const UpdateTeamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  settings: z.object({
    isPrivate: z.boolean().optional(),
    allowedModels: z.array(z.string()).optional(),
    allowedEndpoints: z.array(z.string()).optional(),
    budgetLimit: z.number().min(0).optional(),
  }).optional(),
});

const InviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']).default('member'),
  teamId: z.string().optional(),
});

const UpdateMemberSchema = z.object({
  role: z.enum(['admin', 'member']),
});

export async function organizationRoutes(fastify: FastifyInstance) {
  // Organization routes
  fastify.get('/api/organizations', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const orgs = await organizationService.findByUserId(user.id);
    
    return reply.send({ organizations: orgs });
  });

  fastify.post('/api/organizations', {
    schema: { body: CreateOrganizationSchema },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const input = request.body as z.infer<typeof CreateOrganizationSchema>;
    
    // Check if slug is available
    const existing = await Organization.findOne({ slug: input.slug.toLowerCase() });
    if (existing) {
      return reply.status(400).send({ error: 'Slug already taken' });
    }
    
    const org = await organizationService.create({ ...input, ownerId: user.id });
    
    // Update user's organization
    await User.findByIdAndUpdate(user.id, { 
      $set: { organizationId: org._id, role: 'owner' } 
    });
    
    return reply.status(201).send({ organization: org });
  });

  fastify.get('/api/organizations/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const org = await organizationService.findById(id);
    if (!org) {
      return reply.status(404).send({ error: 'Organization not found' });
    }
    
    // Check access
    const userDoc = await User.findById(user.id);
    if (userDoc?.organizationId?.toString() !== id && org.ownerId.toString() !== user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    
    return reply.send({ organization: org });
  });

  fastify.patch('/api/organizations/:id', {
    schema: { body: UpdateOrganizationSchema },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    const updates = request.body;
    
    const org = await organizationService.update(id, user.id, updates);
    if (!org) {
      return reply.status(404).send({ error: 'Organization not found or unauthorized' });
    }
    
    return reply.send({ organization: org });
  });

  fastify.delete('/api/organizations/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const deleted = await organizationService.delete(id, user.id);
    if (!deleted) {
      return reply.status(404).send({ error: 'Organization not found or unauthorized' });
    }
    
    return reply.send({ success: true });
  });

  // Organization usage
  fastify.get('/api/organizations/:id/usage', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };
    
    const org = await organizationService.findById(id);
    if (!org || org.ownerId.toString() !== user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    
    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate ? new Date(endDate) : new Date();
    
    const usage = await organizationService.getUsage(id, start, end);
    const limits = await organizationService.checkLimits(id);
    
    return reply.send({ usage, limits });
  });

  // Organization members
  fastify.get('/api/organizations/:id/members', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const org = await organizationService.findById(id);
    if (!org || org.ownerId.toString() !== user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    
    // Get members (would need members array in org model)
    return reply.send({ members: [] });
  });

  fastify.post('/api/organizations/:id/members', {
    schema: { body: InviteMemberSchema },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    const { email, role, teamId } = request.body as z.infer<typeof InviteMemberSchema>;
    
    const org = await organizationService.findById(id);
    if (!org || org.ownerId.toString() !== user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    
    // Create invitation
    const { Invitation } = await import('../models');
    const invitation = await Invitation.create({
      organizationId: new Types.ObjectId(id),
      teamId: teamId ? new Types.ObjectId(teamId) : undefined,
      email: email.toLowerCase(),
      role,
      invitedBy: new Types.ObjectId(user.id),
      token: require('crypto').randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });
    
    // TODO: Send invitation email
    
    return reply.status(201).send({ invitation });
  });

  // Teams routes
  fastify.get('/api/organizations/:orgId/teams', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { orgId } = request.params as { orgId: string };
    
    // Verify access
    const org = await organizationService.findById(orgId);
    if (!org || org.ownerId.toString() !== user.id) {
      const userTeams = await teamService.findByUserId(user.id);
      const hasAccess = userTeams.some(t => t.organizationId.toString() === orgId);
      if (!hasAccess) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
    }
    
    const teams = await teamService.findByOrganizationId(orgId);
    return reply.send({ teams });
  });

  fastify.post('/api/organizations/:orgId/teams', {
    schema: { body: CreateTeamSchema },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { orgId } = request.params as { orgId: string };
    const input = request.body as z.infer<typeof CreateTeamSchema>;
    
    const org = await organizationService.findById(orgId);
    if (!org || org.ownerId.toString() !== user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    
    const team = await teamService.create({ ...input, organizationId: orgId, createdBy: user.id });
    
    return reply.status(201).send({ team });
  });

  fastify.get('/api/teams/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const team = await teamService.findById(id);
    if (!team) {
      return reply.status(404).send({ error: 'Team not found' });
    }
    
    // Check access
    const isMember = await teamService.isMember(id, user.id);
    if (!isMember) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    
    return reply.send({ team });
  });

  fastify.patch('/api/teams/:id', {
    schema: { body: UpdateTeamSchema },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    const updates = request.body;
    
    const team = await teamService.update(id, user.id, updates);
    if (!team) {
      return reply.status(404).send({ error: 'Team not found or unauthorized' });
    }
    
    return reply.send({ team });
  });

  fastify.delete('/api/teams/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const deleted = await teamService.delete(id, user.id);
    if (!deleted) {
      return reply.status(404).send({ error: 'Team not found or unauthorized' });
    }
    
    return reply.send({ success: true });
  });

  // Team members
  fastify.get('/api/teams/:id/members', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const isMember = await teamService.isMember(id, user.id);
    if (!isMember) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    
    const members = await teamService.getMembers(id);
    return reply.send({ members });
  });

  fastify.post('/api/teams/:id/members', {
    schema: { body: InviteMemberSchema },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    const { email, role } = request.body as z.infer<typeof InviteMemberSchema>;
    
    const userRole = await teamService.getUserRole(id, user.id);
    if (!userRole || (userRole !== 'owner' && userRole !== 'admin')) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    
    // Find user by email
    const targetUser = await User.findOne({ email: email.toLowerCase() });
    if (!targetUser) {
      return reply.status(404).send({ error: 'User not found' });
    }
    
    const team = await teamService.addMember(id, targetUser._id.toString(), role, user.id);
    if (!team) {
      return reply.status(400).send({ error: 'Failed to add member' });
    }
    
    return reply.status(201).send({ team });
  });

  fastify.patch('/api/teams/:id/members/:userId', {
    schema: { body: UpdateMemberSchema },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id, userId } = request.params as { id: string; userId: string };
    const { role } = request.body as z.infer<typeof UpdateMemberSchema>;
    
    const userRole = await teamService.getUserRole(id, user.id);
    if (!userRole || userRole !== 'owner') {
      return reply.status(403).send({ error: 'Only owner can change roles' });
    }
    
    const team = await teamService.updateMemberRole(id, userId, role, user.id);
    if (!team) {
      return reply.status(400).send({ error: 'Failed to update role' });
    }
    
    return reply.send({ team });
  });

  fastify.delete('/api/teams/:id/members/:userId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id, userId } = request.params as { id: string; userId: string };
    
    const userRole = await teamService.getUserRole(id, user.id);
    if (!userRole || (userRole !== 'owner' && userRole !== 'admin')) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    
    const team = await teamService.removeMember(id, userId, user.id);
    if (!team) {
      return reply.status(400).send({ error: 'Failed to remove member' });
    }
    
    return reply.send({ team });
  });
}