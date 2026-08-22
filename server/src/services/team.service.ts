import { Team, ITeam, ITeamMember, Organization } from '../models';
import { Types } from 'mongoose';

export interface CreateTeamInput {
  organizationId: string;
  name: string;
  description?: string;
  createdBy: string;
  settings?: {
    isPrivate?: boolean;
    allowedModels?: string[];
    allowedEndpoints?: string[];
    budgetLimit?: number;
  };
}

export interface UpdateTeamInput {
  name?: string;
  description?: string;
  settings?: {
    isPrivate?: boolean;
    allowedModels?: string[];
    allowedEndpoints?: string[];
    budgetLimit?: number;
  };
}

export class TeamService {
  async create(input: CreateTeamInput): Promise<ITeam> {
    const team = await Team.create({
      organizationId: new Types.ObjectId(input.organizationId),
      name: input.name,
      description: input.description,
      members: [{
        userId: new Types.ObjectId(input.createdBy),
        role: 'owner',
        joinedAt: new Date(),
      }],
      settings: {
        isPrivate: true,
        allowedModels: [],
        allowedEndpoints: [],
        budgetLimit: 0,
        ...input.settings,
      },
    });
    
    return team;
  }

  async findById(id: string): Promise<ITeam | null> {
    return Team.findById(id);
  }

  async findByOrganizationId(organizationId: string): Promise<ITeam[]> {
    return Team.find({ organizationId: new Types.ObjectId(organizationId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async findByUserId(userId: string): Promise<ITeam[]> {
    return Team.find({ 'members.userId': new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async update(id: string, userId: string, updates: UpdateTeamInput): Promise<ITeam | null> {
    const team = await Team.findById(id);
    if (!team) return null;
    
    // Check if user is owner or admin
    const member = team.members.find(m => m.userId.toString() === userId);
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return null;
    }
    
    const allowedUpdates = ['name', 'description', 'settings'];
    const filteredUpdates: Record<string, unknown> = {};
    
    for (const key of allowedUpdates) {
      if (updates[key as keyof UpdateTeamInput] !== undefined) {
        filteredUpdates[key] = updates[key as keyof UpdateTeamInput];
      }
    }
    
    return Team.findByIdAndUpdate(id, { $set: filteredUpdates }, { new: true });
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const team = await Team.findById(id);
    if (!team) return false;
    
    const member = team.members.find(m => m.userId.toString() === userId);
    if (!member || member.role !== 'owner') {
      return false;
    }
    
    const result = await Team.deleteOne({ _id: id });
    return result.deletedCount > 0;
  }

  async addMember(teamId: string, userId: string, role: 'admin' | 'member' = 'member', addedBy: string): Promise<ITeam | null> {
    const team = await Team.findById(teamId);
    if (!team) return null;
    
    const adder = team.members.find(m => m.userId.toString() === addedBy);
    if (!adder || (adder.role !== 'owner' && adder.role !== 'admin')) {
      return null;
    }
    
    // Check if already a member
    const existing = team.members.find(m => m.userId.toString() === userId);
    if (existing) {
      return team;
    }
    
    return Team.findByIdAndUpdate(
      teamId,
      { $push: { members: { userId: new Types.ObjectId(userId), role, joinedAt: new Date() } } },
      { new: true }
    );
  }

  async removeMember(teamId: string, userId: string, removedBy: string): Promise<ITeam | null> {
    const team = await Team.findById(teamId);
    if (!team) return null;
    
    const remover = team.members.find(m => m.userId.toString() === removedBy);
    const target = team.members.find(m => m.userId.toString() === userId);
    
    if (!remover || !target) return null;
    
    // Can't remove owner
    if (target.role === 'owner') return null;
    
    // Admin can't remove admin/owner
    if (remover.role === 'admin' && (target.role === 'admin' || target.role === 'owner')) return null;
    
    return Team.findByIdAndUpdate(
      teamId,
      { $pull: { members: { userId: new Types.ObjectId(userId) } } },
      { new: true }
    );
  }

  async updateMemberRole(teamId: string, userId: string, role: 'admin' | 'member', updatedBy: string): Promise<ITeam | null> {
    const team = await Team.findById(teamId);
    if (!team) return null;
    
    const updater = team.members.find(m => m.userId.toString() === updatedBy);
    const target = team.members.find(m => m.userId.toString() === userId);
    
    if (!updater || !target) return null;
    
    // Can't change owner role
    if (target.role === 'owner') return null;
    
    // Admin can't promote to owner
    if (updater.role === 'admin' && role === 'owner') return null;
    
    return Team.findByIdAndUpdate(
      teamId,
      { $set: { 'members.$[elem].role': role } },
      { arrayFilters: [{ 'elem.userId': new Types.ObjectId(userId) }], new: true }
    );
  }

  async getMembers(teamId: string): Promise<ITeamMember[]> {
    const team = await Team.findById(teamId).populate('members.userId', 'name email avatar').lean();
    return team?.members || [];
  }

  async isMember(teamId: string, userId: string): Promise<boolean> {
    const team = await Team.findOne({ 
      _id: teamId, 
      'members.userId': new Types.ObjectId(userId) 
    });
    return !!team;
  }

  async getUserRole(teamId: string, userId: string): Promise<'owner' | 'admin' | 'member' | null> {
    const team = await Team.findOne({ 
      _id: teamId, 
      'members.userId': new Types.ObjectId(userId) 
    });
    
    if (!team) return null;
    
    const member = team.members.find(m => m.userId.toString() === userId);
    return member?.role || null;
  }
}

export const teamService = new TeamService();