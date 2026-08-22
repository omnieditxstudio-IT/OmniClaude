import { Organization, IOrganization, Team, ITeam } from '../models';
import { Types } from 'mongoose';

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  ownerId: string;
  avatar?: string;
  billingEmail?: string;
}

export interface UpdateOrganizationInput {
  name?: string;
  avatar?: string;
  billingEmail?: string;
  settings?: {
    allowPublicSignUp?: boolean;
    defaultTeamId?: string;
    usageLimits?: {
      monthlyRequests?: number;
      monthlyTokens?: number;
      monthlyCostUsd?: number;
    };
    retentionDays?: number;
  };
}

export class OrganizationService {
  async create(input: CreateOrganizationInput): Promise<IOrganization> {
    const org = await Organization.create({
      ...input,
      ownerId: new Types.ObjectId(input.ownerId),
      settings: {
        allowPublicSignUp: false,
        usageLimits: {},
        retentionDays: 90,
        ...input.settings,
      },
      subscription: {
        plan: 'free',
        status: 'active',
      },
    });
    
    // Create default team
    await this.createDefaultTeam(org._id.toString(), input.ownerId);
    
    return org;
  }

  async findById(id: string): Promise<IOrganization | null> {
    return Organization.findById(id);
  }

  async findBySlug(slug: string): Promise<IOrganization | null> {
    return Organization.findOne({ slug: slug.toLowerCase() });
  }

  async findByOwnerId(ownerId: string): Promise<IOrganization[]> {
    return Organization.find({ ownerId: new Types.ObjectId(ownerId) }).sort({ createdAt: -1 }).lean();
  }

  async findByUserId(userId: string): Promise<IOrganization[]> {
    return Organization.find({ 
      $or: [
        { ownerId: new Types.ObjectId(userId) },
        { 'members.userId': new Types.ObjectId(userId) } // Would need members array
      ]
    }).sort({ createdAt: -1 }).lean();
  }

  async update(id: string, userId: string, updates: UpdateOrganizationInput): Promise<IOrganization | null> {
    // Check if user is owner or admin
    const org = await Organization.findById(id);
    if (!org) return null;
    
    if (org.ownerId.toString() !== userId) {
      // Check if user is admin in organization
      // This would require checking team membership
      return null;
    }
    
    const allowedUpdates = ['name', 'avatar', 'billingEmail', 'settings'];
    const filteredUpdates: Record<string, unknown> = {};
    
    for (const key of allowedUpdates) {
      if (updates[key as keyof UpdateOrganizationInput] !== undefined) {
        filteredUpdates[key] = updates[key as keyof UpdateOrganizationInput];
      }
    }
    
    return Organization.findByIdAndUpdate(id, { $set: filteredUpdates }, { new: true });
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const org = await Organization.findById(id);
    if (!org || org.ownerId.toString() !== userId) {
      return false;
    }
    
    // Delete all associated resources
    // This should be done in a transaction in production
    await Promise.all([
      // Delete teams, api keys, endpoints, mappings, etc.
    ]);
    
    const result = await Organization.deleteOne({ _id: id });
    return result.deletedCount > 0;
  }

  async addMember(organizationId: string, userId: string, role: 'admin' | 'member' = 'member'): Promise<IOrganization | null> {
    // Add user to organization
    return Organization.findByIdAndUpdate(
      organizationId,
      { $addToSet: { members: { userId: new Types.ObjectId(userId), role } } },
      { new: true }
    );
  }

  async removeMember(organizationId: string, userId: string): Promise<IOrganization | null> {
    return Organization.findByIdAndUpdate(
      organizationId,
      { $pull: { members: { userId: new Types.ObjectId(userId) } } },
      { new: true }
    );
  }

  async updateMemberRole(organizationId: string, userId: string, role: 'admin' | 'member'): Promise<IOrganization | null> {
    return Organization.findByIdAndUpdate(
      organizationId,
      { $set: { 'members.$[elem].role': role } },
      { arrayFilters: [{ 'elem.userId': new Types.ObjectId(userId) }], new: true }
    );
  }

  private async createDefaultTeam(organizationId: string, ownerId: string): Promise<ITeam> {
    return Team.create({
      organizationId: new Types.ObjectId(organizationId),
      name: 'Default',
      description: 'Default team for this organization',
      members: [{
        userId: new Types.ObjectId(ownerId),
        role: 'owner',
        joinedAt: new Date(),
      }],
      settings: {
        isPrivate: true,
      },
    });
  }

  // Usage tracking
  async getUsage(organizationId: string, startDate: Date, endDate: Date): Promise<any> {
    const { RequestLog } = await import('../models');
    const logs = await RequestLog.find({
      organizationId: new Types.ObjectId(organizationId),
      createdAt: { $gte: startDate, $lte: endDate },
    }).lean();
    
    return {
      totalRequests: logs.length,
      totalInputTokens: logs.reduce((sum, l) => sum + l.inputTokens, 0),
      totalOutputTokens: logs.reduce((sum, l) => sum + l.outputTokens, 0),
      totalCost: logs.reduce((sum, l) => sum + (l.inputTokens + l.outputTokens) * 0.001, 0), // Estimate
      avgLatency: logs.length > 0 ? logs.reduce((sum, l) => sum + l.latencyMs, 0) / logs.length : 0,
      errorRate: logs.length > 0 ? logs.filter(l => l.statusCode >= 400).length / logs.length : 0,
    };
  }

  async checkLimits(organizationId: string): Promise<{ withinLimits: boolean; limits: any; usage: any }> {
    const org = await this.findById(organizationId);
    if (!org || !org.settings.usageLimits) {
      return { withinLimits: true, limits: {}, usage: {} };
    }
    
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const usage = await this.getUsage(organizationId, startOfMonth, now);
    
    const limits = org.settings.usageLimits;
    const withinLimits = 
      (!limits.monthlyRequests || usage.totalRequests < limits.monthlyRequests) &&
      (!limits.monthlyTokens || usage.totalInputTokens + usage.totalOutputTokens < limits.monthlyTokens) &&
      (!limits.monthlyCostUsd || usage.totalCost < limits.monthlyCostUsd);
    
    return { withinLimits, limits, usage };
  }
}

export const organizationService = new OrganizationService();